# Ubongo roadmap

The single source of truth for what we're building and in what order.
Update it in the same PR as the work it describes.

## The product

**Who it's for:** busy professionals and founders in East Africa who work on
a Mac and want an assistant that actually *does* things for them, in English
or Swahili, including paying for things.

**The moment we're building toward:** someone downloads Ubongo, opens it
with no warnings, and within 60 seconds asks something in English or
Swahili, and it actually gets done on their Mac.

### What it must do brilliantly

| Priority | Job | Notes |
|---|---|---|
| Core | **Find & summarise my files** | "Where's last week's contract? What does it say?" Built on the file index (`assistant_cli/memory`). |
| Core | **Write & reply for me** | Emails, WhatsApp replies and documents, in your tone, from your files or screen. |
| Core | **By voice, Swahili or English** | The way you use the two jobs above, not a separate feature. |
| Edge | **Wallet: pay bills in nTZS** | Via NEDApay. Ubongo *prepares* a payment; only you approve it. |
| Later | Run my Mac | Apps, windows, music, Downloads. It stays in the app but isn't polished now. |

### Decisions

- **Mac only** for now (Apple Silicon first).
- **Cloud-first:** Claude through the ubongo proxy. Ollama stays as an offline fallback.
- **No invite codes or sign-up.** Each install gets its own key automatically.
- **Surfari is a separate product,** with its own repo and Vercel project.
- **Signed with NEDApay's Apple Developer account.**

## How we work

1. Every change is a PR with one goal, and says what "done" looks like on a Mac.
2. CI builds on macOS and starts the packaged server (`scripts/smoke_server.sh`).
3. Before a release, test the build on a real Mac (`scripts/run-local.sh` or the CI DMG).
4. Release with **Actions → Release → Run workflow** and the version number.

## Phase 0: installable and trustworthy (now)

- [x] Server packaging fixed; macOS smoke test in CI and release (0.6.2)
- [x] No invite codes or `INVITE_SECRET`; access sets itself up
- [x] Download links always point to the newest DMG
- [x] `scripts/run-local.sh`: run the app from source in one command
- [ ] Deploy the proxy: `cd proxy && fly deploy` *(Victor)*
- [ ] Release 0.6.2: Actions → Release → Run workflow → `0.6.2` *(Victor)*
- [ ] Signing + notarization *(workflow ready; needs NEDApay's Apple secrets, see `docs/RELEASING.md`)*
- [ ] Auto-update with the Tauri updater *(needs an updater public key, see `docs/RELEASING.md`)*
- [x] Every merge builds a test DMG on macOS (CI artifact `ubongo-dmg`)
- [ ] Move Surfari to its own repo and Vercel project; Ubongo gets its own landing site
- [x] README describes the real product

## Phase 1: the core loop

- [x] Find & summarise, step 1: read inside PDFs, Word, PowerPoint, Excel, OpenDocument and text
      files; search matches what documents *say*; `read_file` tool; multi-step agent loop
      (search → read → answer) that names the file it used
- [ ] Find & summarise, step 2: search by meaning (embeddings), not only matching words; scanned PDFs (OCR)
- [ ] Find & summarise, step 3: answers show the source file as a card you can open
- [ ] Write & reply: drafts in the user's chosen tone; copy or insert into the frontmost app
- [ ] Voice in Swahili and English, end to end
- [ ] A CI test for each hero flow
- [ ] Hide unfinished features from the UI

## Phase 2: the wallet (NEDApay, nTZS)

Rule: **Ubongo prepares, the user approves.** Approval is a confirm card plus a
PIN or Touch ID, with daily limits. Nothing is ever paid silently.

- [ ] Agree the NEDApay API: auth, custody, limits, compliance
- [ ] Read-only: balance and history ("what did I spend on LUKU this month?")
- [ ] Bill pay with confirm card + PIN/Touch ID + limits
- [ ] Saved payees and reminders ("pay DAWASA every month")

## Phase 3: money and scale

- [ ] Per-install cost ceiling and a usage dashboard on the proxy
- [ ] Pricing (Pro tier and/or wallet fees)
- [ ] Accounts, so access moves with the user across devices
