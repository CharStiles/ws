# charstiles.com

Personal website. Built with [Eleventy](https://www.11ty.dev/), deployed to
GitHub Pages automatically on every push to `main`.

## Adding a new page (the whole point of this setup)

Drop a markdown file in the right folder. That's it — it shows up in the
section list automatically after you push.

**New performance** → create `src/performances/my-show.md`:

```markdown
---
title: My Show
date: 2026-07-11
venue: Some Festival
---

Words about the show. Markdown works: [links](https://example.com),
**bold**, images:

![alt text](/assets/images/my-show.jpg)
```

**New research** → same thing in `src/research/`.

Images go in `src/assets/images/` (create it if it doesn't exist) and are
referenced as `/assets/images/whatever.jpg`.

## Publishing

```sh
git add .
git commit -m "add new show"
git push
```

GitHub Actions rebuilds and deploys in ~1 minute. Check the Actions tab on
the repo if something looks off.

## Previewing locally

```sh
npm install   # first time only
npm start     # serves at http://localhost:8080, live-reloads
```

## One-time setup (do these once)

1. Create a GitHub repo and push this folder to it:

   ```sh
   git remote add origin git@github.com:CharStiles/charstiles.com.git
   git push -u origin main
   ```

2. On GitHub: repo **Settings → Pages → Source** → select **GitHub Actions**.

3. Point DNS at GitHub Pages (in your domain registrar, replacing the
   current Replit records):
   - `A` records for the apex `charstiles.com`:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Optional `CNAME` record for `www` → `charstiles.github.io`
   - Back in repo **Settings → Pages**, set the custom domain to
     `charstiles.com` and tick **Enforce HTTPS** once the cert is issued.

4. Put your real email-list signup URL in `src/_data/site.json`
   (`emailList` — currently a placeholder).

## Where things live

| What | Where |
| --- | --- |
| Home page | `src/index.njk` |
| About | `src/about.md` |
| Performances | `src/performances/*.md` |
| Research | `src/research/*.md` |
| Site-wide links (email list, Instagram) | `src/_data/site.json` |
| Styles | `src/assets/css/style.css` |
| Hover shader | `src/assets/js/hover-shader.js` |
| Fonts | `src/assets/fonts/` |

To keep a page out of the shader effect, add `data-no-shader` to the element.
