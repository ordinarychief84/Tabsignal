package com.tabcall.wear

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * TabCall Wear SDK — Kotlin client for Wear OS.
 *
 * Mirrors the TypeScript core in `sdk/tabcall-wear/typescript` 1:1.
 * Zero third-party dependencies: HttpURLConnection + org.json (both in
 * the Android runtime), so it drops into any Wear OS project without
 * touching your dependency graph. Every method here is BLOCKING — call
 * from a coroutine on Dispatchers.IO:
 *
 *     val sdk = TabCallWearClient("https://tab-call.com", storedToken)
 *     withContext(Dispatchers.IO) { sdk.pair("123456", "Maya's Watch") }
 *
 * Lifecycle:
 *   1. Waiter opens /staff/watch on their phone → 6-digit code.
 *   2. `pair(code)` → long-lived device token; persist it from
 *      `onToken` (EncryptedSharedPreferences recommended).
 *   3. Poll `queue()` honoring `pollAfterMs`; register your FCM token
 *      via `registerPushToken` so a push wakes the app between polls
 *      (see the Wear OS quickstart in this folder's README).
 *   4. `acknowledge(id)` / `resolve(id, action)` from the wrist.
 *
 * A [WearException] with `needsRepair == true` (HTTP 401) means the
 * token is dead — revoked, staff removed, or re-paired. Wipe it and
 * show the pairing screen.
 */
class TabCallWearClient(
    baseUrl: String,
    @Volatile private var token: String? = null,
    private val onToken: ((String) -> Unit)? = null,
) {
    private val baseUrl: String = baseUrl.trimEnd('/')

    val isPaired: Boolean get() = token != null

    /** Forget the local token (server-side revoke lives in the staff console). */
    fun unpair() { token = null }

    // ------------------------------------------------------------------ types

    enum class ResolutionAction { SERVED, COMPED, REFUSED, ESCALATED, NOT_ACTIONABLE, OTHER }

    data class QueueItem(
        val id: String,
        val type: String,        // DRINK | BILL | HELP | REFILL
        val status: String,      // PENDING | ACKNOWLEDGED | ESCALATED
        val table: String,
        val note: String?,
        val idCheck: Boolean,
        val ageSeconds: Int,
        val assignedToMe: Boolean,
        val mine: Boolean,
        val ackedBy: String?,
    )

    data class Queue(
        val serverTime: String,
        val staffName: String,
        /** Server-suggested delay before the next poll, in ms. Honor it. */
        val pollAfterMs: Long,
        val requests: List<QueueItem>,
    )

    data class PairResult(
        val token: String,
        val deviceId: String,
        val staffName: String,
        val venueName: String,
        val venueSlug: String,
    )

    data class AckResult(val id: String, val status: String, val mine: Boolean, val ackedBy: String?, val alreadyAcked: Boolean)

    data class ResolveResult(val id: String, val status: String, val resolutionAction: String?, val alreadyResolved: Boolean)

    class WearException(val status: Int, val code: String, detail: String?) :
        IOException(detail ?: "$code (HTTP $status)") {
        /** Token is dead — wipe it and re-pair. */
        val needsRepair: Boolean get() = status == 401
    }

    // ------------------------------------------------------------------- api

    @Throws(WearException::class)
    fun pair(code: String, deviceName: String = "Wear OS watch"): PairResult {
        val body = JSONObject()
            .put("code", code)
            .put("name", deviceName)
            .put("platform", "wearos")
        val json = request("POST", "/api/wear/claim", body, authenticated = false)
        val result = PairResult(
            token = json.getString("token"),
            deviceId = json.getJSONObject("device").getString("id"),
            staffName = json.getJSONObject("staff").getString("name"),
            venueName = json.getJSONObject("venue").getString("name"),
            venueSlug = json.getJSONObject("venue").getString("slug"),
        )
        token = result.token
        onToken?.invoke(result.token)
        return result
    }

    @Throws(WearException::class)
    fun queue(): Queue {
        val json = request("GET", "/api/wear/queue", null)
        val items = json.getJSONArray("requests")
        return Queue(
            serverTime = json.getString("serverTime"),
            staffName = json.getJSONObject("staff").getString("name"),
            pollAfterMs = json.getLong("pollAfterMs"),
            requests = (0 until items.length()).map { i -> items.getJSONObject(i).toQueueItem() },
        )
    }

    @Throws(WearException::class)
    fun acknowledge(requestId: String): AckResult {
        val json = request("POST", "/api/wear/requests/$requestId/ack", JSONObject())
        return AckResult(
            id = json.getString("id"),
            status = json.getString("status"),
            mine = json.optBoolean("mine"),
            ackedBy = json.optStringOrNull("ackedBy"),
            alreadyAcked = json.optBoolean("alreadyAcked"),
        )
    }

    @Throws(WearException::class)
    fun resolve(requestId: String, action: ResolutionAction, note: String? = null): ResolveResult {
        val body = JSONObject().put("action", action.name)
        if (note != null) body.put("note", note)
        val json = request("POST", "/api/wear/requests/$requestId/resolve", body)
        return ResolveResult(
            id = json.getString("id"),
            status = json.getString("status"),
            resolutionAction = json.optStringOrNull("resolutionAction"),
            alreadyResolved = json.optBoolean("alreadyResolved"),
        )
    }

    /** Register (token) or clear (null) this watch's own FCM token. */
    @Throws(WearException::class)
    fun registerPushToken(fcmToken: String?) {
        val body = JSONObject().put("token", fcmToken ?: JSONObject.NULL)
        request("POST", "/api/wear/fcm-token", body)
    }

    // -------------------------------------------------------------- plumbing

    private fun request(
        method: String,
        path: String,
        body: JSONObject?,
        authenticated: Boolean = true,
    ): JSONObject {
        if (authenticated && token == null) {
            throw WearException(401, "NOT_PAIRED", "No device token — call pair() first.")
        }
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("x-tabcall-wear-sdk", "kotlin/1.0.0")
            if (authenticated) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) {
                conn.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            }
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() } ?: ""
            val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw WearException(status, json.optString("error", "HTTP_ERROR"), json.optStringOrNull("detail"))
            }
            return json
        } catch (e: IOException) {
            if (e is WearException) throw e
            throw WearException(0, "NETWORK", e.message)
        } finally {
            conn.disconnect()
        }
    }

    private fun JSONObject.toQueueItem() = QueueItem(
        id = getString("id"),
        type = getString("type"),
        status = getString("status"),
        table = getString("table"),
        note = optStringOrNull("note"),
        idCheck = optBoolean("idCheck"),
        ageSeconds = optInt("ageSeconds"),
        assignedToMe = optBoolean("assignedToMe"),
        mine = optBoolean("mine"),
        ackedBy = optStringOrNull("ackedBy"),
    )

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (isNull(key)) null else optString(key, "").ifEmpty { null }
}
