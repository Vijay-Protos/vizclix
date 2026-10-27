/**
 * Builds the site into _site/ with its words, lists and images taken from the
 * published VizClix page in Payload (the Polycrayons admin, multi-site).
 *
 * index.html stays the hand-built page and still works on its own; this fills
 * it in. Every element it fills is looked up by selector and a missing one
 * stops the build, so a markup change can never silently drop content.
 *
 * Media are downloaded into _site/assets/cms/ so visitors never load anything
 * from the CMS server; only the enquiry popup posts to it. Without PAYLOAD_URL
 * the page is published unchanged, which keeps the site independent of the CMS.
 *
 *   PAYLOAD_URL=https://polycrayons.com npm run build
 */
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { parseHTML } from 'linkedom'

const OUT = '_site'
const STATIC = ['css', 'js', 'vendor', 'assets']
const PAYLOAD_URL = process.env.PAYLOAD_URL?.replace(/\/$/, '')
const SITE = process.env.VIZCLIX_SITE || 'vizclix'

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT)
for (const dir of STATIC) await cp(dir, `${OUT}/${dir}`, { recursive: true })
let html = await readFile('index.html', 'utf8')

if (!PAYLOAD_URL) {
  console.log('No PAYLOAD_URL: publishing index.html as written')
} else {
  const api = `${PAYLOAD_URL}/api/vizclix-site?where[tenant.slug][equals]=${encodeURIComponent(SITE)}&depth=1&limit=1`
  const res = await fetch(api)
  if (!res.ok) throw new Error(`CMS answered ${res.status} for ${api}`)
  const page = (await res.json()).docs?.[0]
  if (!page) throw new Error(`no published VizClix page for site "${SITE}"`)
  const { document } = parseHTML(html)
  const files = render(document, page)
  await mkdir(`${OUT}/assets/cms`, { recursive: true })
  await Promise.all([...files].map(async ([local, url]) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`media ${url} answered ${r.status}`)
    await writeFile(`${OUT}/${local}`, Buffer.from(await r.arrayBuffer()))
  }))
  html = document.toString()
  console.log(`Rendered from ${PAYLOAD_URL} (site "${SITE}", updated ${page.updatedAt}), ${files.size} media files`)
}
await writeFile(`${OUT}/index.html`, html)

function render(doc, d) {
  const files = new Map()
  const $ = (sel, root = doc) => {
    const el = root.querySelector(sel)
    if (!el) throw new Error(`build: "${sel}" not found in index.html`)
    return el
  }
  const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)]
  const pad = (i) => String(i + 1).padStart(2, '0')

  /** Replaces an element's own text, keeping its child elements (the ember dot, arrows, icons). */
  const text = (el, s = '') => {
    for (const n of [...el.childNodes]) if (n.nodeType === 3) n.remove()
    el.prepend(doc.createTextNode(el.querySelector('svg') ? `${s} ` : s))
  }
  /** A heading: its words, with *starred* words set in the heavy weight, keeping the ember dot. */
  const rich = (el, s = '') => {
    for (const n of [...el.childNodes]) if (n.nodeType === 3 || (n.nodeType === 1 && n.classList.contains('em'))) n.remove()
    const parts = s.split(/(\*[^*]+\*)/).filter(Boolean)
    const first = el.firstChild
    for (const part of parts) {
      if (part.startsWith('*') && part.endsWith('*')) {
        const b = doc.createElement('b'); b.className = 'em'; b.textContent = part.slice(1, -1); el.insertBefore(b, first)
      } else el.insertBefore(doc.createTextNode(part), first)
    }
  }
  /** The small "[ … ]" placeholder after a line. */
  const note = (el, s) => {
    for (const c of [...el.children]) if (c.classList.contains('tbc')) c.remove()
    if (!s) return
    const span = doc.createElement('span')
    span.className = 'mono tbc'
    span.textContent = `[ ${s} ]`
    el.append(' ', span)
  }
  /** Rebuilds a list from its first children, one clone per item. */
  const list = (box, items = [], fill) => {
    const tpl = [...box.children]
    if (!tpl.length) throw new Error('build: empty list template')
    for (const c of tpl) c.remove()
    items.forEach((it, i) => {
      const el = tpl[Math.min(i, tpl.length - 1)].cloneNode(true)
      fill(el, it, i)
      box.append(el)
    })
  }
  const media = (m) => {
    if (!m || typeof m !== 'object' || !m.url) return null
    const local = `assets/cms/${m.filename}`
    files.set(local, new URL(m.url, PAYLOAD_URL).href)
    return { src: local, width: m.width, height: m.height, alt: m.alt ?? '' }
  }
  const img = (el, m, alt) => {
    const f = media(m)
    if (!f) throw new Error(`build: image missing for ${el.getAttribute('src')}`)
    el.setAttribute('src', f.src)
    if (f.width) el.setAttribute('width', f.width)
    if (f.height) el.setAttribute('height', f.height)
    el.setAttribute('alt', alt ?? f.alt)
  }
  const feed = (sec, f) => {
    const src = f?.kind === 'plan' ? 'plan' : f?.kind === 'none' ? null : media(f?.file)?.src
    if (!src) return sec.removeAttribute('data-feed')
    sec.setAttribute('data-feed', [src, f.label || '', f.stock ? 'stock' : ''].join('|'))
  }
  const head = (sec, h) => {
    const sh = $('.sec-head', sec)
    rich($('.h2', sh), h.heading)
    let body = sh.querySelector('p.body')
    if (h.body || h.note) {
      if (!body) sh.append((body = Object.assign(doc.createElement('p'), { className: 'body' })))
      text(body, h.body)
      note(body, h.note)
    } else body?.remove()
    const bw = sec.querySelector('.bigword')
    if (h.bigWord && bw) bw.textContent = h.bigWord
    else if (!h.bigWord) bw?.remove()
    if (h.label) sec.setAttribute('data-section', sec.getAttribute('data-section').replace(/— .*/, `— ${h.label}`))
  }
  const link = (el, label, href) => {
    text(el, label)
    if (href) el.setAttribute('href', href)
  }

  // ── Hero & intro ──
  const hero = $('#hero')
  text($('.hero-copy > .slash', hero), d.hero.eyebrow)
  rich($('.h1', hero), d.hero.heading)
  text($('.hero-body', hero), d.hero.body)
  text($('.cta-solid', hero), d.hero.primaryCta)
  text($('.cta-line', hero), d.hero.secondaryCta)
  text($('.quote-link'), d.hero.primaryCta)
  const foot = $('.hero-foot', hero), drag = $('.drag-cue', foot)
  const tagTpl = $('.tag:not(.drag-cue)', foot)
  $$('.tag:not(.drag-cue)', foot).forEach((t) => t.remove())
  for (const t of d.hero.tags ?? []) {
    const el = tagTpl.cloneNode(true)
    el.textContent = `[ ${t.text} ]`
    foot.insertBefore(el, drag)
  }
  const intro = $('#intro')
  text($('.slash', intro), `/ ${d.intro.label}`)
  text($('.statement', intro), d.intro.statement)
  intro.setAttribute('data-section', intro.getAttribute('data-section').replace(/— .*/, `— ${d.intro.label}`))

  // ── The flight: three chapters ──
  const chapters = $$('#flight .chapter')
  if (chapters.length !== 3) throw new Error('build: expected 3 flight chapters')
  const chapterLink = $('.link-arrow', chapters[2]).cloneNode(true)
  chapters.forEach((el, i) => {
    const c = d.chapters[i]
    text($('.slash', el), `/ ${c.label}`)
    rich($('.h2', el), c.heading)
    text($('.body', el), c.body)
    let a = el.querySelector('.link-arrow')
    if (c.linkLabel) {
      if (!a) $('.body', el).after((a = chapterLink.cloneNode(true)))
      text(a, c.linkLabel)
    } else a?.remove()
  })

  // ── Work ──
  const work = $('#work'), w = d.work
  head(work, w.head)
  feed(work, w.feed)
  list($('.cards', work), w.cards, (el, c, i) => {
    el.setAttribute('class', `card c${i + 1}`)
    if (c.link) el.setAttribute('href', c.link)
    else {
      el.removeAttribute('href')
      el.querySelector('.sr-only')?.remove()
    }
    img($('img.art', el), c.image)
    $('.ph', el).textContent = `[ ${c.tag || 'Studio Work'} ]`
    text($('.meta .slash', el), c.credit ? `/ Work — ${c.credit}` : '/ Work')
    text($('h3', el), c.title)
    $('.loc', el).textContent = c.location ?? ''
    $('.num', el).textContent = pad(i)
  })
  link($('.more .link-arrow', work), w.moreLabel, w.moreUrl)

  // ── Case study ──
  const study = $('#study'), s = d.study
  head(study, s.head)
  feed(study, s.feed)
  const [shot, survey] = $$('.ba img', study)
  img(shot, s.image)
  img(survey, s.image, '')
  $('.study-shot figcaption', study).textContent = s.caption ?? ''
  const blocks = $$('.study-block', study)
  text($('p', blocks[0]), s.brief)
  list($('ul', blocks[1]), s.constraints, (el, c) => { el.textContent = c.text })
  list($('ol', blocks[2]), s.shots, (el, c, i) => {
    el.replaceChildren()
    const n = Object.assign(doc.createElement('span'), { className: 'mono', textContent: pad(i) })
    el.append(n, ` ${c.text}`)
  })
  text($('p', blocks[3]), s.delivered)
  note($('p', blocks[3]), s.deliveredNote)
  text($('.link-arrow', blocks[3]), s.ctaLabel)

  // ── Services ──
  const services = $('#services'), sv = d.services
  head(services, sv.head)
  feed(services, sv.feed)
  const inline = $('.inline-link', services).cloneNode(true)
  list($('.svc-list', services), sv.items, (el, it, i) => {
    $('.n', el).textContent = pad(i)
    $('h3', el).textContent = it.title
    const p = $('p', el)
    p.textContent = it.body
    if (it.linkLabel) {
      const a = inline.cloneNode(true)
      a.textContent = it.linkLabel
      a.setAttribute('href', it.linkUrl || '#contact')
      p.append(' ', a)
    }
    for (const c of [...el.children]) if (c.classList.contains('tbc')) c.remove()
    if (it.note) el.append(Object.assign(doc.createElement('span'), { className: 'mono tbc', textContent: `[ ${it.note} ]` }))
  })
  text($('.more .link-arrow', services), sv.ctaLabel)

  // ── Moves: the icons are drawn in index.html, in this order ──
  const grammar = $('#grammar'), mv = d.moves
  head(grammar, mv.head)
  feed(grammar, mv.feed)
  const moveIcons = Object.fromEntries(['orbit', 'reveal', 'fly-through', 'top-down', 'parallax', 'lock-off']
    .map((k, i) => [k, $('svg', $$('.moves article', grammar)[i])]))
  list($('.moves', grammar), mv.items, (el, it, i) => {
    $('svg', el).replaceWith(moveIcons[it.icon].cloneNode(true))
    $('.n', el).textContent = pad(i)
    $('h3', el).textContent = it.title
    $('p:not(.use)', el).textContent = it.body
    const use = $('.use', el)
    if (!it.answers) return use.remove()
    for (const n of [...use.childNodes]) if (n.nodeType === 3) n.remove()
    use.append(` ${it.answers}`)
  })

  // ── Perspective ──
  const persp = $('#perspective'), pv = d.perspective
  head(persp, pv.head)
  feed(persp, pv.feed)
  const perspIcons = Object.fromEntries(['location', 'scale', 'context']
    .map((k, i) => [k, $('svg', $$('.three article', persp)[i])]))
  list($('.three', persp), pv.items, (el, it) => {
    $('svg', el).replaceWith(perspIcons[it.icon].cloneNode(true))
    $('.slash', el).textContent = `/ ${it.label}`
    $('h3', el).textContent = it.title
    $('p', el).textContent = it.body
  })

  // ── Process ──
  const process = $('#process'), pr = d.process
  head(process, pr.head)
  feed(process, pr.feed)
  list($('.steps', process), pr.steps, (el, it, i) => {
    $('.num', el).textContent = pad(i)
    $('h3', el).textContent = it.title
    const p = $('p', el)
    p.textContent = it.body
    note(p, it.note)
  })

  // ── Fly with us ──
  const partner = $('#partner'), pa = d.partner
  head(partner, pa.head)
  feed(partner, pa.feed)
  const [bring, yours] = $$('.deal article', partner)
  const line = (el, it) => { el.textContent = it.text; note(el, it.note) }
  list($('ul', bring), pa.weBring, line)
  list($('ul', yours), pa.youBring, line)
  const cov = $('.coverage > .slash', partner)
  text(cov, `/ ${pa.citiesLabel ?? ''}`)
  note(cov, pa.citiesNote)
  const pulse = $('.cities .dotpulse', partner).cloneNode(true)
  list($('.cities', partner), pa.cities, (el, c) => {
    el.textContent = c.name
    if (c.open) el.prepend(pulse.cloneNode(true))
  })
  text($('.coverage .link-arrow', partner), pa.ctaLabel)

  // ── Proof & questions ──
  const proof = $('#proof'), pf = d.proof
  head(proof, pf.head)
  $('.clients > .slash', proof).textContent = `/ ${pf.clientsLabel ?? ''}`
  $('.clients-note', proof).textContent = pf.clientsNote ?? ''
  list($('.logos', proof), pf.clients, (el, c) => img($('img', el), c.logo, c.name))
  list($('.slots', proof), pf.slots, (el, it) => {
    $('.mono', el).textContent = `[ ${it.label} ]`
    $('p', el).textContent = it.body
  })
  const faq = $('#faq')
  head(faq, d.faq.head)
  list($('.qs', faq), d.faq.items, (el, it) => {
    if (it.openByDefault) el.setAttribute('open', '')
    else el.removeAttribute('open')
    text($('summary', el), it.question)
    const a = $('.a', el)
    a.textContent = it.answer
    note(a, it.note)
  })

  // ── Contact & footer ──
  const contact = $('#contact')
  head(contact, d.contact.head)
  feed(contact, d.contact.feed)
  const f = d.footer
  $('.foot-row > .body').textContent = f.tagline ?? ''
  $('.contact-ph').textContent = f.contactLine ?? ''
  for (const a of $$('a[href^="https://www.instagram.com"]')) if (f.instagram) a.setAttribute('href', f.instagram)
  for (const a of $$('a')) if (f.parentUrl && a.textContent.trim() === 'Part of Polycrayons') a.setAttribute('href', f.parentUrl)

  // ── The enquiry popup posts to the same CMS ──
  $('meta[name="enquiry-endpoint"]').setAttribute('content', `${PAYLOAD_URL}/api/vizclix-enquiries/submit`)

  // ── SEO & sharing ──
  const seo = d.seo
  const meta = (attr, key) => $(`meta[${attr}="${key}"]`)
  $('title').textContent = seo.title
  meta('name', 'description').setAttribute('content', seo.description)
  $('link[rel="canonical"]').setAttribute('href', seo.canonicalUrl)
  meta('property', 'og:url').setAttribute('content', seo.canonicalUrl)
  meta('property', 'og:title').setAttribute('content', seo.shareTitle || seo.title)
  meta('property', 'og:description').setAttribute('content', seo.shareDescription || seo.description)
  const share = media(seo.shareImage)
  if (share) {
    meta('property', 'og:image').setAttribute('content', new URL(share.src, seo.canonicalUrl).href)
    meta('property', 'og:image:alt').setAttribute('content', share.alt)
  }
  if (!seo.noindex) meta('name', 'robots').remove()
  const ld = $('script[type="application/ld+json"]')
  const json = JSON.parse(ld.textContent)
  json.url = seo.canonicalUrl
  if (share) json.image = new URL(share.src, seo.canonicalUrl).href
  if (f.instagram) json.sameAs = [f.instagram]
  if (f.parentUrl) json.parentOrganization.url = f.parentUrl
  ld.textContent = JSON.stringify(json)

  return files
}
