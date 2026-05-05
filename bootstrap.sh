#!/usr/bin/env bash
# TabCall — one-shot bootstrap (v2: direct Node binary, no git/nvm needed).
# Installs Node LTS to ~/.local/node, fetches reference repos, attempts skill installs.
# Safe to re-run: each step is idempotent.
#
# Usage:  bash bootstrap.sh
# Log:    /tmp/tabcall_bootstrap.log

set +e
LOG=/tmp/tabcall_bootstrap.log
: > "$LOG"
say()  { printf "\n=== %s ===\n" "$*" | tee -a "$LOG"; }
ok()   { printf "  [OK]   %s\n" "$*" | tee -a "$LOG"; }
fail() { printf "  [FAIL] %s\n" "$*" | tee -a "$LOG"; }
skip() { printf "  [SKIP] %s\n" "$*" | tee -a "$LOG"; }

NODE_VERSION="v20.18.1"
NODE_HOME="$HOME/.local/node"
SKILLS_ROOT="$HOME/.claude/skills"

# ---------------------------------------------------------------------------
say "1/6  Node ${NODE_VERSION} (direct download, no git required)"
if [ -x "$NODE_HOME/bin/node" ]; then
  skip "node already installed at $NODE_HOME"
else
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) NODE_ARCH="x64" ;;
    arm64)  NODE_ARCH="arm64" ;;
    *)      fail "unsupported arch: $ARCH"; exit 1 ;;
  esac
  TARBALL="node-${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
  URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
  mkdir -p "$NODE_HOME"
  cd /tmp || exit 1
  echo "downloading $URL" >>"$LOG"
  if curl -sSL -o "$TARBALL" "$URL" >>"$LOG" 2>&1; then
    if tar -xzf "$TARBALL" -C "$NODE_HOME" --strip-components=1 >>"$LOG" 2>&1; then
      ok "node $NODE_VERSION installed to $NODE_HOME"
      rm -f "$TARBALL"
    else
      fail "tar extract failed"; exit 1
    fi
  else
    fail "node download failed"; exit 1
  fi
fi
export PATH="$NODE_HOME/bin:$PATH"

node --version 2>/dev/null && ok "node $(node --version)" || fail "node not callable"
npm  --version 2>/dev/null && ok "npm  $(npm --version)"  || fail "npm  not callable"
npx  --version 2>/dev/null && ok "npx  $(npx --version)"  || fail "npx  not callable"

# ---------------------------------------------------------------------------
say "2/6  PATH persistence (add Node to ~/.zshrc if missing)"
LINE='export PATH="$HOME/.local/node/bin:$PATH"'
if [ -f "$HOME/.zshrc" ] && grep -Fq "$LINE" "$HOME/.zshrc"; then
  skip "PATH already in ~/.zshrc"
else
  printf '\n# Added by TabCall bootstrap\n%s\n' "$LINE" >> "$HOME/.zshrc"
  ok "appended to ~/.zshrc — open a new terminal to inherit"
fi

# ---------------------------------------------------------------------------
say "3/6  skills workspace"
mkdir -p "$SKILLS_ROOT/_external" && ok "$SKILLS_ROOT/_external"

# ---------------------------------------------------------------------------
say "4/6  fetch 4 reference repos (idempotent)"
cd "$SKILLS_ROOT/_external" || exit 1
for r in obra/superpowers obra/superpowers-lab yusufkaraaslan/Skill_Seekers BehiSecc/awesome-claude-skills; do
  name=${r##*/}
  if [ -d "$name" ]; then skip "$name (exists)"; continue; fi
  fetched=0
  for branch in main master; do
    code=$(curl -sL -o "$name.tar.gz" -w "%{http_code}" "https://codeload.github.com/$r/tar.gz/refs/heads/$branch")
    if [ "$code" = "200" ]; then
      tar -xzf "$name.tar.gz" 2>>"$LOG" \
        && mv "${name}-$branch" "$name" 2>>"$LOG" \
        && rm -f "$name.tar.gz" \
        && ok "$name ($branch)"
      fetched=1; break
    fi
    rm -f "$name.tar.gz"
  done
  [ $fetched -eq 1 ] || fail "$name (no main/master branch reachable)"
done

# ---------------------------------------------------------------------------
say "5/6  npx skills add (7 commands)"
cd /tmp || exit 1
for s in stitch-design stitch-loop design-md enhance-prompt react:components remotion shadcn-ui; do
  printf '\n--- skills add stitch-skills --skill %s --global ---\n' "$s" >>"$LOG"
  if npx -y skills add google-labs-code/stitch-skills --skill "$s" --global >>"$LOG" 2>&1; then
    ok "$s"
  else
    fail "$s (see log; package or skill may not exist)"
  fi
done

# ---------------------------------------------------------------------------
say "6/6  summary"
echo "Repos:" | tee -a "$LOG"
ls -1 "$SKILLS_ROOT/_external" 2>/dev/null | sed 's/^/  /' | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Skills installed under $SKILLS_ROOT (excluding _external):" | tee -a "$LOG"
ls -1 "$SKILLS_ROOT" 2>/dev/null | grep -v '^_external$' | sed 's/^/  /' | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Full log: $LOG"
