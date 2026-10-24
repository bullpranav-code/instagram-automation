# Appu27 handover (start the new Appu27 chat here)

**Owner:** Boss (Pranav). Instagram **@appu27.isl** (Creator account), YouTube **@Appu27kbfc**, Facebook page "Appu27".
**Goal:** a big ISL fan page by the end of the season. Stretch target 25K followers by 31 Dec 2026; base case 3–8K. Money: YouTube Shorts (YPP: 1,000 subs + 10M Shorts views in 90 days, rising to 20M for applications after 31 Jan 2027) and local sponsors. Instagram does not pay per view in India.
**Character:** Appu, a 9-year-old Kerala Blasters kid from Kochi, jersey #27. Moods: happy / sad / shocked (vector, in `design/templates.html`).
**Style:** sunburst (yellow #FFC629/#F7A600 or red #E03A3E/#B8282C), Anton headline with thick black outline, Malayalam tag in Baloo Chettan 2, Poppins body, pill label top-left, @appu27.isl badge top-right, black footer.
**Rules:** never use ISL or club logos, broadcast screenshots or player photos from the internet (copyright strikes kill pages). Facts need 2+ sources, or are labelled REPORTED. Scores only from official or reliable sources. Music: only our original tracks (`music/`), never downloaded songs. Footer line: "Fan page · not affiliated with ISL or clubs". Boss checks the Malayalam.
**Preferences:** step-by-step guidance (one step at a time, few screenshots), address him as "Boss", he approves; Claude does the rest. Stories first, then posts, then reels. Approvals: WhatsApp preferred (via Meta Cloud API, still to set up).

## How posting works today (live and tested 24 Oct 2026)
1. Media goes to the **gh-pages** branch of `bullpranav-code/instagram-automation`. Public URL via jsDelivr, pinned to the commit SHA:
   `https://cdn.jsdelivr.net/gh/bullpranav-code/instagram-automation@<SHA>/m/<date>/<file>`
2. A job JSON goes in `appu27/jobs/` on **main** and its filename is added to `appu27/jobs/index.json`.
   Fields: `type` (POST | STORY | REEL | CAROUSEL), `files` [urls], `preview` (image url or comma list), `caption`, `group` (unique id).
3. The Google Apps Script **"Appu27 auto post"** (owner bullpranav@gmail.com) pulls `index.json` every 10 minutes (or run `pullNow`). It adds a row to the **Appu27 Queue** sheet (Drive id `1zl-3SLP0yVdPmv8sAsjPuZsPL3K_VBC0NLlz0Ss46jA`) and emails Boss.
4. **Approve:** type `yes` (or ok / okay / 👍) in the row's Status cell. It posts instantly through the onEdit trigger. *The email Approve link currently runs an OLD deployment version; fix it by setting Manage deployments → Version → New version.*
5. Script properties hold `IG_TOKEN` (Instagram Login, refreshed weekly), `FOOTBALL_KEY` (API-Football), `LINK_KEY`, `IG_USER_ID`, `QUEUE_ID`. Never paste secrets into chat or the repo.
- Web app URL: `https://script.google.com/macros/s/AKfycbzOQV6iArNbFbYKWCQgOtb6YjdBuSmYzTUdV68VciI3QCWM7S3uH3_9usJ-xZFzWL2Txg/exec`
  (`?a=data&from=YYYY-MM-DD&to=YYYY-MM-DD` gives public cached ISL fixtures once the deployment runs v1.3; league 323, season 2026)
- Meta app: "Appu27 auto post" on developers.facebook.com, use case "Manage messaging & content on Instagram"; appu27.isl added as Instagram Tester.

## Making media (in this folder)
```
cd appu27 && npm i && npx playwright install chromium
cd design && node ../tools/shot.js       # renders the artboards listed in shot.js to PNG
node ../tools/reel.js                     # renders frames of the #story artboard (reel.html) -> frames/
ffmpeg -framerate 30 -i frames/f%04d.png -i ../music/appu27_matchday_hype.mp3 -t 9 -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -shortest out.mp4
```
Reels: 1080x1920, H.264/AAC. Feed: 1080x1350 JPG. Stories: 1080x1920.

## Done so far
- 24 Oct: matchday story (KBFC vs MCFC), preview reel and "Last week. Next up." recap carousel, all posted through approval.
- Content tracker from earlier work: `APPU27-Content-Tracker-and-Calendar.xlsx` (owner pranav@27yoc.com; launch packs pack-1/3a/3b/4/5 are not in this Drive).

## Next
1. Fix the deployment version (Approve links) and set up **WhatsApp approvals** through Meta Cloud API (same Meta app).
2. v1.4: auto first comment (`comment` field) and 1–2 verified @mentions per caption. Pinning stays manual (no API).
3. Robot on GitHub Actions (schedule on main): fixtures/results from the web app `a=data` → render FT poster, story and reel (mood music) → push gh-pages and job → approval. Covers all 13 clubs; KBFC gets reels.
4. Image tagging needs the Facebook-login connection (link the Appu27 FB page).
5. "Road to 25K" calendar, Appu WhatsApp sticker pack, Appu Predicts leaderboard.
