# שבצ״ק – notes for Claude

- App: React + TypeScript + Vite PWA, deployed to https://amir-inbar.github.io/shavtzak/ by the GitHub Actions workflow on every push to `main`.
- The real roster (soldiers' names) lives only in `data/board.json` and the site code in `data/.code`. `data/` is git-ignored: never commit it, never put names in `src/` or `public/` in plain text.
- To change the roster use the `shavtzak` MCP tools: `shavtzak_board` → `shavtzak_assign_many` / `shavtzak_update_people` / `shavtzak_edit_person` → `shavtzak_check` → `shavtzak_publish`.
  Publishing writes the encrypted `public/board.enc.json` and pushes; the manager taps "טען" on the site.
- Tables usually arrive as screenshots or pasted sheet text: day | hours | סיור (מפקד, נהג, חיילים) | כרמל (מפקד, חיילים with "23:00 - name" listening hours) | תורן (daily). "-" = empty/continuing.
- After changing `mcp/*.ts` run `npm run mcp:build`. After changing `src/` run `npm run typecheck` and `npm run build`.
