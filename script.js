const CONTENT_PATH = "content/site-content.json";

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element && value !== undefined && value !== null) {
    element.textContent = value;
  }
};

const setMultilineText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element && value) {
    element.innerHTML = value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .join("<br>");
  }
};

const setLink = (selector, item) => {
  const element = document.querySelector(selector);
  if (!element || !item) return;

  const label = item.label || item.text || "";
  const href = String(item.href || "").trim();
  const hasDestination = href && href !== "#";

  if (hasDestination) {
    element.textContent = label;
    element.href = href;
    element.classList.remove("coming-soon-btn");
    element.removeAttribute("aria-disabled");
    return;
  }

  element.textContent = `${label}${label ? " · " : ""}Coming Soon`;
  element.removeAttribute("href");
  element.classList.add("coming-soon-btn");
  element.setAttribute("aria-disabled", "true");
};

const escapeHtml = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function renderShared(content) {
  document.querySelectorAll("[data-site-short-name]").forEach(el => {
    const words = content.site.shortName.trim().split(/\s+/);
    el.innerHTML = words.length > 1
      ? `${escapeHtml(words[0])}<br>${escapeHtml(words.slice(1).join(" "))}`
      : escapeHtml(content.site.shortName);
    el.classList.add("brand-name-stacked");
  });

  document.querySelectorAll("[data-site-logo]").forEach(img => {
    img.src = content.site.logo;
    img.alt = `${content.site.shortName} logo`;
  });

  document.documentElement.style.setProperty(
    "--mother-church-logo",
    `url("${content.site.logo}")`
  );

  document.documentElement.style.setProperty(
    "--pdcm-logo",
    `url("${content.chapels.current[0]?.logo || "assets/logos/pdcm-generic.png"}")`
  );

  document.querySelectorAll("[data-site-full-name]").forEach(el => {
    el.textContent = content.site.fullName;
  });

  document.querySelectorAll("[data-site-tagline]").forEach(el => {
    el.textContent = content.site.tagline;
  });

  document.querySelectorAll("[data-copyright-year]").forEach(el => {
    el.textContent = content.site.copyrightYear;
  });

  setText("[data-service-sunday]", content.site.serviceTimes.sunday);
  setText("[data-service-midweek]", content.site.serviceTimes.midweek);

  const navigation = document.querySelector("[data-navigation]");
  if (navigation) {
    navigation.innerHTML = content.navigation.map(item => {
      const isSermons = item.href === "sermons.html";
      const isChapels = item.label === "CHAPELS" || item.href === "chapels.html";
      const live = liveChannels(content);
      const classNames = [item.className, isSermons && live.length ? "nav-live-now" : ""].filter(Boolean).join(" ");
      const className = classNames ? ` class="${escapeHtml(classNames)}"` : "";
      const href = isSermons && live.length ? (live.length === 1 ? `live.html?chapel=${encodeURIComponent(live[0].key)}` : "live.html") : item.href;
      const label = isSermons && live.length ? `<span class="live-pulse-dot"></span> LIVE NOW` : escapeHtml(item.label);

      if (!item.children?.length || isSermons) {
        return `<a${className} href="${escapeHtml(href)}">${label}</a>`;
      }

      const effectiveChildren = isChapels
        ? [
            { label: "All Chapels", href: "chapels.html" },
            ...worshipLocationRegistry(content).map(location => ({
              label: location.label,
              href: location.href
            }))
          ]
        : item.children;

      const children = effectiveChildren.map(child => `
        <a href="${escapeHtml(child.href)}">${escapeHtml(child.label)}</a>
      `).join("");

      return `
        <div class="nav-dropdown">
          <div class="nav-dropdown-trigger">
            <a${className} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
            <button class="nav-submenu-toggle" type="button"
              aria-label="Open ${escapeHtml(item.label)} menu"
              aria-expanded="false">⌄</button>
          </div>
          <div class="nav-submenu">${children}</div>
        </div>
      `;
    }).join("");
  }
}


function renderHeroSlides(slides) {
  const container = document.querySelector("[data-hero-slides]");
  if (!container || !slides?.length) return;

  container.innerHTML = slides.map((slide, index) => `
    <div
      class="hero-slide${index === 0 ? " active" : ""}"
      style="background-image:url('${escapeHtml(slide.image)}')"
      role="img"
      aria-label="${escapeHtml(slide.alt)}"
    ></div>
  `).join("");

  const items = [...container.querySelectorAll(".hero-slide")];
  if (items.length < 2) return;

  let current = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  let timer = setInterval(() => {
    items[current].classList.remove("active");
    current = (current + 1) % items.length;
    items[current].classList.add("active");
  }, 5500);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(timer);
    } else {
      timer = setInterval(() => {
        items[current].classList.remove("active");
        current = (current + 1) % items.length;
        items[current].classList.add("active");
      }, 5500);
    }
  });
}

function extractYouTubeVideoId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Accept a bare YouTube video ID.
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const candidate = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const watchId = url.searchParams.get("v") || "";
      if (/^[A-Za-z0-9_-]{11}$/.test(watchId)) return watchId;

      const parts = url.pathname.split("/").filter(Boolean);
      if (["live", "embed", "shorts"].includes(parts[0])) {
        const candidate = parts[1] || "";
        return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
      }
    }
  } catch (_) {
    return "";
  }

  return "";
}


function canonicalWorshipLocationKey(value){
  const key=String(value||"").trim();
  if(["mother-church","general","mother","motherchurch","mother_church"].includes(key)) return "peculiar-hq";
  return key;
}
function chapelLabelForKey(content,key){
  const canonical=canonicalWorshipLocationKey(key);
  if(canonical==="peculiar-hq") return "Peculiar HQ";
  const c=content.chapels?.details?.[canonical];
  return c?.shortTitle||c?.title||canonical;
}
function chapelHrefForKey(content,key){
  const canonical=canonicalWorshipLocationKey(key);
  if(canonical==="peculiar-hq") return "peculiar-hq.html";
  return content.chapels?.details?.[canonical]?.href||`${canonical}.html`;
}
function worshipLocationRegistry(content){
  const details=content?.chapels?.details||{};
  const current=Array.isArray(content?.chapels?.current)?content.chapels.current:[];
  const byId=new Map();

  current.forEach(item=>{
    const id=canonicalWorshipLocationKey(item?.id);
    if(!id) return;
    const detail=details[id]||{};
    byId.set(id,{
      id,
      label:item?.name||detail?.title||detail?.shortTitle||id,
      href:item?.href||detail?.href||chapelHrefForKey(content,id),
      locationType:id==="peculiar-hq"?"hq":"chapel"
    });
  });

  Object.entries(details).forEach(([rawId,detail])=>{
    const id=canonicalWorshipLocationKey(rawId);
    if(!id||byId.has(id)) return;
    byId.set(id,{
      id,
      label:detail?.title||detail?.shortTitle||id,
      href:detail?.href||chapelHrefForKey(content,id),
      locationType:id==="peculiar-hq"?"hq":"chapel"
    });
  });

  return [...byId.values()].sort((a,b)=>{
    if(a.id==="peculiar-hq") return -1;
    if(b.id==="peculiar-hq") return 1;
    return String(a.label).localeCompare(String(b.label));
  });
}
function broadcastState(channel){
  if(!channel?.enabled) return "hidden";
  const o=String(channel.statusOverride||"auto").toLowerCase();
  if(["live","upcoming","recap","hidden"].includes(o)&&o!=="auto") return o;
  const b=channel.currentBroadcast||{}, now=Date.now(), start=Date.parse(b.startsAt||""), end=Date.parse(b.endsAt||"");
  const media=Boolean(extractYouTubeVideoId(b.videoUrl));
  if(Number.isFinite(start)&&now<start) return "upcoming";
  if(Number.isFinite(start)&&media&&(!Number.isFinite(end)||now<=end)) return "live";
  if(media&&(Number.isFinite(end)?now>end:!Number.isFinite(start))) return "recap";
  return "upcoming";
}
function nextService(channel){
  const s=Array.isArray(channel?.schedule)?channel.schedule:[];
  if(!s.length) return null;
  const offset=Number(channel.utcOffsetMinutes??60), now=new Date(), local=new Date(now.getTime()+offset*60000);
  let best=null;
  s.forEach(item=>{
    const [hh,mm]=String(item.time||"09:00").split(":").map(Number);
    let d=(Number(item.dayOfWeek)-local.getUTCDay()+7)%7;
    let cand=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+d,hh,mm));
    if(d===0&&cand<=local) cand.setUTCDate(cand.getUTCDate()+7);
    const utc=new Date(cand.getTime()-offset*60000);
    if(!best||utc<best.date) best={date:utc,label:item.label||"Next Service"};
  });
  return best;
}
function countdown(date){
  if(!date) return "";
  let m=Math.max(0,Math.floor((date-Date.now())/60000)),d=Math.floor(m/1440),h=Math.floor((m%1440)/60);m%=60;
  return d?`${d}d ${h}h ${m}m`:h?`${h}h ${m}m`:`${Math.max(1,m)}m`;
}
function broadcastChannels(content){
  const normalized=new Map();
  Object.entries(content.livestream?.channels||{}).forEach(([rawKey,ch])=>{
    const key=canonicalWorshipLocationKey(rawKey);
    const item={key,...ch,label:key==="peculiar-hq"?"Peculiar HQ":(ch.label||chapelLabelForKey(content,key)),state:broadcastState(ch)};
    if(!normalized.has(key)||rawKey===key) normalized.set(key,item);
  });
  return [...normalized.values()].filter(ch=>ch.enabled&&ch.state!=="hidden");
}
function liveChannels(content){ return broadcastChannels(content).filter(ch=>ch.state==="live"); }
function broadcastModel(content,ch){
  const b=ch.currentBroadcast||{}, next=nextService(ch), state=ch.state||broadcastState(ch), vid=String(b.videoUrl||"").trim();
  return {state,title:b.title||b.serviceType||"Next Service",speaker:b.speaker||"",videoUrl:vid,youtubeId:extractYouTubeVideoId(vid),external:vid||ch.youtubeChannelUrl||"",next,chapelLabel:ch.label||chapelLabelForKey(content,ch.key),chapelHref:chapelHrefForKey(content,ch.key)};
}
function stateLabel(s){return s==="live"?"LIVE NOW":s==="recap"?"LATEST SERVICE":"UPCOMING";}
function broadcastMarkup(content,ch){
  const m=broadcastModel(content,ch), next=m.next?`${escapeHtml(m.next.label)} in ${escapeHtml(countdown(m.next.date))}`:"";
  return `<div class="broadcast-inline broadcast-${escapeHtml(m.state)}">
    <div class="broadcast-inline-player">${m.youtubeId?`<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.youtubeId)}?rel=0" title="${escapeHtml(m.title)}" allowfullscreen></iframe>`:`<div class="broadcast-player-empty"><span>${escapeHtml(stateLabel(m.state))}</span><strong>${escapeHtml(m.title)}</strong></div>`}</div>
    <div class="broadcast-inline-copy"><div class="broadcast-card-topline"><span class="broadcast-state-badge">${m.state==="live"?'<span class="live-pulse-dot"></span>':""}${escapeHtml(stateLabel(m.state))}</span>${next?`<span class="broadcast-countdown">${next}</span>`:""}</div><div class="meta">${escapeHtml(m.chapelLabel)}</div><h3>${escapeHtml(m.title)}</h3>${m.speaker?`<p>${escapeHtml(m.speaker)}</p>`:""}<div class="hero-actions">${m.external?`<a class="btn btn-primary" href="${escapeHtml(m.external)}" target="_blank" rel="noopener noreferrer">${m.state==="live"?"Watch Live":m.state==="recap"?"Watch Recap":"YouTube Channel"} ↗</a>`:""}<a class="btn btn-secondary" href="live.html?chapel=${encodeURIComponent(ch.key)}">Broadcast Details</a></div></div>
  </div>`;
}
function renderLive(content){
  setText("[data-live-eyebrow]",content.livestream?.hero?.eyebrow);
  setText("[data-live-title]",content.livestream?.hero?.title);
  setText("[data-live-description]",content.livestream?.hero?.description);

  const channels=broadcastChannels(content);
  const live=liveChannels(content);
  const pills=document.querySelector("[data-live-pills]");
  const main=document.querySelector("[data-live-main]");
  const loc=document.querySelector("[data-live-locations]");

  const q=canonicalWorshipLocationKey(new URLSearchParams(location.search).get("chapel"));

  // Deep links may intentionally open an upcoming/recap chapel.
  // Without a deep link, the hub defaults to a chapel that is actually live.
  let active=channels.some(c=>c.key===q)
    ? q
    : (live[0]?.key||channels[0]?.key||"");

  const draw=()=>{
    const ch=channels.find(c=>c.key===active)||live[0]||channels[0];
    if(!ch)return;

    // The selector row is a LIVE selector, not a permanent chapel filter.
    // Therefore only chapels that are live appear here.
    if(pills){
      pills.innerHTML=live.length>1
        ? live.map(c=>`<button class="broadcast-channel-pill ${c.key===active?"active":""}" data-broadcast-key="${escapeHtml(c.key)}"><span class="live-pulse-dot"></span>${escapeHtml(c.label)}</button>`).join("")
        : "";

      pills.hidden=live.length<=1;

      pills.querySelectorAll("[data-broadcast-key]").forEach(b=>b.onclick=()=>{
        active=b.dataset.broadcastKey;
        const u=new URL(location.href);
        u.searchParams.set("chapel",active);
        history.replaceState(null,"",u);
        draw();
      });
    }

    if(main) main.innerHTML=broadcastMarkup(content,ch);
  };

  // This remains an overview of every configured broadcast location.
  // It is not the temporary LIVE chapel selector above.
  if(loc) loc.innerHTML=channels.map(c=>`<article class="broadcast-card"><div class="broadcast-card-topline"><span class="broadcast-state-badge">${c.state==="live"?'<span class="live-pulse-dot"></span>':""}${escapeHtml(stateLabel(c.state))}</span></div><div class="meta">${escapeHtml(c.label)}</div><h3>${escapeHtml((c.currentBroadcast||{}).title||(c.currentBroadcast||{}).serviceType||"Broadcast")}</h3><a class="text-link" href="live.html?chapel=${encodeURIComponent(c.key)}">View broadcast ↗</a></article>`).join("");

  draw();
}

function renderHome(content) {
  const home = content.home || {};
  const hero = home.hero || {};
  const identity = home.identity || {};
  const pastor = home.pastor || {};
  const testimonials = home.testimonials || {};

  if (home.themes) {
    setText("[data-year-theme-label]", home.themes.year?.label);
    setText("[data-year-theme-title]", home.themes.year?.title);
    setText("[data-year-theme-scripture]", home.themes.year?.scripture);

    setText("[data-month-theme-label]", home.themes.month?.label);
    setText("[data-month-theme-title]", home.themes.month?.title);
    setText("[data-month-theme-scripture]", home.themes.month?.scripture);
  }

  renderHeroSlides(Array.isArray(hero.slides) ? hero.slides : []);
  setText("[data-home-hero-badge]", hero.badge);
  setText("[data-home-hero-title]", hero.title);
  setText("[data-home-hero-highlight]", hero.highlight);
  setText("[data-home-hero-description]", hero.description);
  setLink("[data-home-primary-button]", hero.primaryButton);
  setLink("[data-home-secondary-button]", hero.secondaryButton);

  setText("[data-home-scroll-text]", hero.scrollText);

  setText("[data-home-identity-eyebrow]", identity.eyebrow);
  setText("[data-home-identity-title]", identity.title);
  setText("[data-home-identity-description]", identity.description);

  const identityCards = document.querySelector("[data-home-identity-cards]");
  if (identityCards) {
    const cards = Array.isArray(identity.cards) ? identity.cards : [];
    identityCards.innerHTML = cards.map(card => `
      <article class="card">
        <div class="icon">${escapeHtml(card.icon)}</div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
      </article>
    `).join("");
  }

  const homeMinistries = document.querySelector("[data-home-ministries]");
  if (homeMinistries) {
    const ministrySection = content.ministries || {};
    const featuredKeys = Array.isArray(ministrySection.homeFeatured)
      ? ministrySection.homeFeatured
      : [];
    const ministryDetails = ministrySection.details || {};

    homeMinistries.innerHTML = featuredKeys
      .map(key => ministryDetails[key])
      .filter(Boolean)
      .map(item => ministryCard(item))
      .join("");
  }

  setText("[data-pastor-eyebrow]", pastor.eyebrow);
  setText("[data-pastor-title]", pastor.title);
  setText("[data-pastor-text]", pastor.text);
  setText("[data-pastor-name]", pastor.name);
  setText("[data-pastor-role]", pastor.role);

  const pastorLink = document.querySelector("[data-pastor-link]");
  if (pastorLink) {
    pastorLink.textContent = pastor.linkLabel ? `${pastor.linkLabel} ↗` : "";
    if (pastor.linkHref) {
      pastorLink.href = pastor.linkHref;
    } else {
      pastorLink.removeAttribute("href");
    }
  }

  const pastorPhoto = document.querySelector("[data-pastor-photo]");
  if (pastorPhoto && pastor.image) {
    pastorPhoto.style.backgroundImage = `url("${pastor.image}")`;
    pastorPhoto.style.backgroundSize = "cover";
    pastorPhoto.style.backgroundPosition = "center";
    pastorPhoto.innerHTML = "";
  }

  const homeSermons = document.querySelector("[data-home-sermons]");
  if (homeSermons) {
    const sermonItems = Array.isArray(content.sermons?.items) ? content.sermons.items : [];
    homeSermons.innerHTML = sermonItems.slice(0, 3).map(sermon => sermonCard(sermon)).join("");
    const sermonSection = homeSermons.closest("section");
    if (sermonSection) sermonSection.hidden = sermonItems.length === 0;
  }

  setText("[data-testimonials-eyebrow]", testimonials.eyebrow);
  setText("[data-testimonials-title]", testimonials.title);
  setText("[data-testimonials-description]", testimonials.description);

  const testimonialList = document.querySelector("[data-testimonials-list]");
  if (testimonialList) {
    const testimonialItems = Array.isArray(testimonials.items) ? testimonials.items : [];
    testimonialList.innerHTML = testimonialItems.map(item => `
      <article class="testimonial-card${item.featured ? " featured-testimonial" : ""}">
        <div class="testimonial-mark">“</div>
        <p>${escapeHtml(item.quote)}</p>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.chapel)}</span>
      </article>
    `).join("");
    const testimonialSection = testimonialList.closest("section");
    if (testimonialSection) testimonialSection.hidden = testimonialItems.length === 0;
  }

  const homeBroadcast=document.querySelector("[data-home-broadcast]");
  if(homeBroadcast){const all=broadcastChannels(content), chosen=liveChannels(content)[0]||all[0]; homeBroadcast.innerHTML=chosen?broadcastMarkup(content,chosen):"";}

  const quickLinks = document.querySelector("[data-home-quick-links]");
  if (quickLinks) {
    const links = Array.isArray(content.quickLinks?.links)
      ? content.quickLinks.links
      : [];
    quickLinks.innerHTML = links.slice(2, 5).map(link => quickLinkCard(link)).join("");
  }
}

function sermonCard(sermon, options = {}) {
  const chapelLabel = String(
    options.chapelLabel ||
    sermon.chapelName ||
    sermon.chapel ||
    ""
  ).trim();

  const categoryLabel = String(
    sermon.serviceType ||
    sermon.category ||
    sermon.series ||
    "Sermon"
  ).trim();

  const image = String(
    sermon.image ||
    sermon.thumbnail ||
    "assets/hero/mother-church-brand.jpg"
  ).trim();

  const detailParts = [
    sermon.speaker,
    sermon.duration,
    sermon.dateDisplay || sermon.date
  ].filter(Boolean);

  return `
    <article class="card sermon-card">
      <div class="sermon-thumb" style="background-image:url('${escapeHtml(image)}')">
        <span class="play">▶</span>
      </div>
      <div class="sermon-body">
        ${chapelLabel ? `<div class="sermon-chapel-tag">${escapeHtml(chapelLabel)}</div>` : ""}
        <div class="meta">${escapeHtml(categoryLabel)}</div>
        <h3>${escapeHtml(sermon.title || "Sermon")}</h3>
        ${detailParts.length ? `<p>${detailParts.map(escapeHtml).join(" · ")}</p>` : ""}
      </div>
    </article>
  `;
}

function quickLinkCard(link) {
  const href = String(link?.href || "").trim();
  const hasDestination = href && href !== "#";

  if (!hasDestination) {
    return `
      <div class="quick-link coming-soon-quick-link" aria-disabled="true">
        <div class="icon">${escapeHtml(link.icon)}</div>
        <div>
          <div class="meta">Coming Soon</div>
          <h3>${escapeHtml(link.title)}</h3>
          <p>${escapeHtml(link.text)}</p>
        </div>
      </div>
    `;
  }

  return `
    <a class="quick-link" href="${escapeHtml(href)}">
      <div class="icon">${escapeHtml(link.icon)}</div>
      <div>
        <h3>${escapeHtml(link.title)}</h3>
        <p>${escapeHtml(link.text)}</p>
      </div>
    </a>
  `;
}

function renderStandardHero(section) {
  if (!section?.hero) return;
  setText("[data-page-hero-eyebrow]", section.hero.eyebrow);
  setMultilineText("[data-page-hero-title]", section.hero.title);
  setText("[data-page-hero-description]", section.hero.description);
}

function renderAbout(content) {
  renderStandardHero(content.about);
  setText("[data-about-story-eyebrow]", content.about.story.eyebrow);
  setText("[data-about-story-title]", content.about.story.title);

  const storyBody = document.querySelector("[data-about-story-body]");
  if (storyBody) {
    const storyParagraphs = Array.isArray(content.about.story.paragraphs)
      ? content.about.story.paragraphs
      : [];
    const storyQuote = String(content.about.story.quote || "").trim();

    const paragraphsHtml = storyParagraphs
      .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");

    const quoteHtml = storyQuote
      ? `<blockquote class="about-pull-quote">“${escapeHtml(storyQuote)}”</blockquote>`
      : "";

    storyBody.innerHTML = `${quoteHtml}${paragraphsHtml}`;
  }

  const values = document.querySelector("[data-about-values]");
  if (values) {
    values.innerHTML = content.about.values.map(value => `
      <article class="card">
        <h3>${escapeHtml(value.title)}</h3>
        <p>${escapeHtml(value.text)}</p>
      </article>
    `).join("");
  }

  const leadership = content.about?.leadership;
  if (leadership) {
    setText("[data-about-leadership-eyebrow]", leadership.eyebrow || "Our leadership");
    setText("[data-about-leadership-title]", leadership.title || "Shepherds of the flock.");
    setText("[data-about-leadership-description]", leadership.description || "Trusted men and women called to serve with humility, faithfulness, and a love for God's people.");

    const teamGrid = document.querySelector("[data-about-leadership-team]");
    if (teamGrid) {
      const team = Array.isArray(leadership.team) ? leadership.team : [];
      if (team.length) {
        teamGrid.innerHTML = team.map((person, i) => {
          const hasPhoto = person.image && person.image.trim() !== "";
          const initials = (person.name || "LP")
            .split(/[\s,()]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(w => w[0].toUpperCase())
            .join("") || "LP";
          const photoHtml = hasPhoto
            ? `<img class="leader-photo" src="${escapeHtml(person.image)}" alt="Photo of ${escapeHtml(person.name || 'Leader')}" loading="lazy">`
            : `<div class="leader-avatar" aria-hidden="true"><span>${escapeHtml(initials)}</span></div>`;
          return `
            <article class="leader-card" style="--i:${i}">
              <div class="leader-photo-wrap">
                <div class="leader-photo-ring"></div>
                ${photoHtml}
              </div>
              <div class="leader-info">
                <strong class="leader-name">${escapeHtml(person.name || 'Leader')}</strong>
                <span class="leader-position">${escapeHtml(person.position || 'Leader')}</span>
              </div>
            </article>
          `;
        }).join("");
        const leadershipSection = teamGrid.closest("section");
        if (leadershipSection) leadershipSection.hidden = false;
      } else {
        teamGrid.innerHTML = "";
        const leadershipSection = teamGrid.closest("section");
        if (leadershipSection) leadershipSection.hidden = true;
      }
    }
  }
}

function renderChapels(content) {
  renderStandardHero(content.chapels);

  const inferredHref = chapel => {
    if (chapel.href) return chapel.href;

    const name = String(chapel.name || "").toLowerCase();
    if (name.includes("gwarinpa")) return "pdcm-gwarinpa.html";
    if (name.includes("english")) return "pdcm-english.html";
    if (name.includes("byazhin")) return "pdcm-byazhin.html";
    if (name.includes("mega youth")) return "pdcm-mega-youth.html";
    return "#";
  };

  const current = document.querySelector("[data-current-chapels]");
  if (current) {
    current.innerHTML = (content.chapels.current || []).map(chapel => {
      const href = inferredHref(chapel);
      return `
        <a class="card campus-card chapel-link-card" href="${escapeHtml(href)}">
          <div class="campus-logo-wrap">
            <img class="campus-logo" loading="lazy" src="${escapeHtml(chapel.logo)}" alt="${escapeHtml(chapel.name)} logo">
          </div>
          <div class="campus-body">
            <div class="meta">${escapeHtml(chapel.status || "Current Chapel")}</div>
            <h3>${escapeHtml(chapel.name)}</h3>
            <p>${escapeHtml(chapel.subtitle || "")}</p>
            <span class="text-link chapel-card-link">Explore chapel ↗</span>
          </div>
        </a>
      `;
    }).join("");
  }

  const upcoming = document.querySelector("[data-upcoming-chapels]");
  if (upcoming) {
    upcoming.innerHTML = (content.chapels.upcoming || []).map(chapel => `
      <article class="card campus-card upcoming-card">
        <div class="campus-logo-wrap">
          <img class="campus-logo" loading="lazy" src="${escapeHtml(chapel.logo)}" alt="${escapeHtml(chapel.name)} placeholder logo">
        </div>
        <div class="campus-body">
          <div class="meta">Upcoming</div>
          <h3>${escapeHtml(chapel.name)}</h3>
          <p>${escapeHtml(chapel.text)}</p>
        </div>
      </article>
    `).join("");
  }
}

function renderSermons(content) {
  renderStandardHero(content.sermons);
  const live=liveChannels(content), sec=document.querySelector("[data-sermon-live-section]"), tabs=document.querySelector("[data-sermon-live-tabs]"), main=document.querySelector("[data-sermon-live-main]");
  if(sec) sec.hidden=!live.length;
  if(live.length&&main){
    let active=live[0].key;
    const draw=()=>{const ch=live.find(c=>c.key===active)||live[0]; main.innerHTML=broadcastMarkup(content,ch); if(tabs){tabs.innerHTML=live.length>1?live.map(c=>`<button class="broadcast-live-tab ${c.key===active?"active":""}" data-live-key="${escapeHtml(c.key)}"><span class="live-pulse-dot"></span>${escapeHtml(c.label)}</button>`).join(""):""; tabs.querySelectorAll("[data-live-key]").forEach(b=>b.onclick=()=>{active=b.dataset.liveKey;draw();});}};
    draw();
  }
  const list=document.querySelector("[data-sermons-list]");
  if(list){
    const items=(Array.isArray(content.sermons?.items)?content.sermons.items:[]).filter(s=>s.published!==false).sort((a,b)=>(Date.parse(b.date||"")||0)-(Date.parse(a.date||"")||0));
    list.innerHTML=items.map(s=>sermonCard(s,{chapelLabel:s.chapelId?chapelLabelForKey(content,s.chapelId):""})).join("");
    const section=list.closest("section"); if(section)section.hidden=!items.length;
  }
}


function publicationDate(value, options = {}) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...options
  }).format(date);
}

function publicationPostUrl(post) {
  return `publication.html?slug=${encodeURIComponent(post.slug)}`;
}

function publicationCover(post, modifier = "") {
  const cover = post.cover || {};
  const theme = cover.theme || "navy";
  return `
    <div class="publication-blog-cover publication-cover-${escapeHtml(theme)} ${escapeHtml(modifier)}">
      <span>${escapeHtml(cover.label || post.type)}</span>
      <strong>${escapeHtml(cover.monogram || "PC")}</strong>
      <div>
        <small>${escapeHtml(publicationDate(post.date))}</small>
        <h3>${escapeHtml(post.title)}</h3>
      </div>
    </div>
  `;
}

function publicationPostCard(post) {
  return `
    <article class="publication-blog-card" data-publication-category="${escapeHtml(post.category)}">
      <a href="${publicationPostUrl(post)}" aria-label="Read ${escapeHtml(post.title)}">
        ${publicationCover(post, "publication-card-cover")}
      </a>
      <div class="publication-blog-card-body">
        <div class="publication-card-meta">
          <span>${escapeHtml(post.type)}</span>
          <time datetime="${escapeHtml(post.date)}">${escapeHtml(publicationDate(post.date))}</time>
        </div>
        <h3><a href="${publicationPostUrl(post)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <div class="publication-card-tags">
          ${(post.tags || []).slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
        <a class="text-link" href="${publicationPostUrl(post)}">Read publication ↗</a>
      </div>
    </article>
  `;
}

function publicationCompactFeature(post) {
  if (!post) return "";
  return `
    <article class="publication-compact-feature">
      ${publicationCover(post, "publication-compact-cover")}
      <div>
        <div class="meta">${escapeHtml(publicationDate(post.date))}</div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <a class="btn btn-primary" href="${publicationPostUrl(post)}">Read Now</a>
      </div>
    </article>
  `;
}

function renderPublications(content) {
  renderStandardHero(content.publications);

  const blog = content.publications.blog;
  const posts = [...(blog?.posts || [])].sort((a, b) =>
    new Date(`${b.date}T12:00:00`) - new Date(`${a.date}T12:00:00`)
  );

  setText("[data-publication-blog-eyebrow]", blog?.eyebrow);
  setText("[data-publication-blog-title]", blog?.title);
  setText("[data-publication-blog-description]", blog?.description);

  const categoriesContainer = document.querySelector("[data-publication-categories]");
  const postsContainer = document.querySelector("[data-publication-posts]");
  const searchInput = document.querySelector("[data-publication-search]");
  const empty = document.querySelector("[data-publication-empty]");
  let selectedCategory = "all";
  let searchValue = "";

  if (categoriesContainer) {
    categoriesContainer.innerHTML = (blog?.categories || []).map((category, index) => {
      const count = category.id === "all"
        ? posts.length
        : posts.filter(post => post.category === category.id).length;
      return `
        <button class="publication-category-button${index === 0 ? " active" : ""}"
          type="button" data-publication-filter="${escapeHtml(category.id)}">
          ${escapeHtml(category.label)} <span>${count}</span>
        </button>
      `;
    }).join("");
  }

  const renderPosts = () => {
    const query = searchValue.trim().toLowerCase();
    const filtered = posts.filter(post => {
      const categoryMatch = selectedCategory === "all" || post.category === selectedCategory;
      const searchable = [post.title, post.excerpt, post.type, post.author, ...(post.tags || [])]
        .join(" ").toLowerCase();
      return categoryMatch && (!query || searchable.includes(query));
    });

    if (postsContainer) postsContainer.innerHTML = filtered.map(publicationPostCard).join("");
    if (empty) empty.hidden = filtered.length > 0;
  };

  categoriesContainer?.addEventListener("click", event => {
    const button = event.target.closest("[data-publication-filter]");
    if (!button) return;
    selectedCategory = button.dataset.publicationFilter;
    categoriesContainer.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
    renderPosts();
  });

  searchInput?.addEventListener("input", event => {
    searchValue = event.target.value;
    renderPosts();
  });

  document.querySelectorAll("[data-filter-publications]").forEach(link => {
    link.addEventListener("click", () => {
      const value = link.dataset.filterPublications;
      const button = categoriesContainer?.querySelector(`[data-publication-filter="${value}"]`);
      button?.click();
    });
  });

  renderPosts();

  const latestByCategory = category => posts.find(post => post.category === category);
  const latestDevotion = document.querySelector("[data-latest-devotion]");
  const latestGoodnews = document.querySelector("[data-latest-goodnews-blog]");
  const latestSchool = document.querySelector("[data-latest-sunday-school]");
  if (latestDevotion) latestDevotion.innerHTML = publicationCompactFeature(latestByCategory("devotion"));
  if (latestGoodnews) latestGoodnews.innerHTML = publicationCompactFeature(latestByCategory("goodnews"));
  if (latestSchool) latestSchool.innerHTML = publicationCompactFeature(latestByCategory("sunday-school"));

  const lectionary = content.publications?.lectionaryCalendar;
  const lectionaryContainer = document.querySelector("[data-lectionary-readings]");
  const monthSelect = document.querySelector("[data-lectionary-month-select]");

  if (!lectionary) {
    if (lectionaryContainer) {
      lectionaryContainer.innerHTML = `<div class="publication-empty-state">Lectionary data is currently unavailable.</div>`;
    }
    return;
  }

  setText("[data-lectionary-eyebrow]", lectionary.eyebrow);
  setText("[data-lectionary-title]", lectionary.title);
  setText("[data-lectionary-description]", lectionary.description);
  setLink("[data-lectionary-download]", { label: lectionary.button, href: lectionary.href });

  const readingItems = Array.isArray(lectionary.readings) ? lectionary.readings : [];
  const months = [...new Set(readingItems.map(item => item.month).filter(Boolean))];
  const currentMonthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date());
  let selectedMonth = months.includes(currentMonthName)
    ? currentMonthName
    : (lectionary.currentMonth || months[0] || "").split(" ")[0];

  if (monthSelect) {
    monthSelect.innerHTML = months.map(month => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join("");
    monthSelect.value = selectedMonth;
  }

  const renderLectionaryMonth = month => {
    selectedMonth = month;
    setText("[data-lectionary-month]", `${month} 2026`);
    if (!lectionaryContainer) return;
    const filtered = readingItems.filter(item => item.month === month);
    lectionaryContainer.innerHTML = filtered.map(reading => `
      <article class="lectionary-card">
        <div class="lectionary-card-top">
          <div class="lectionary-date">${escapeHtml(reading.dateDisplay || reading.date)}</div>
          <span class="lectionary-week">${escapeHtml(reading.week)}</span>
        </div>
        ${reading.event ? `<div class="lectionary-special-event">${escapeHtml(reading.event)}</div>` : ""}
        <h3>${escapeHtml(reading.topic)}</h3>
        <div class="lectionary-scripture">
          <span>Scripture</span>
          <strong>${escapeHtml(reading.scripture)}</strong>
        </div>
        ${reading.objective ? `
          <details class="lectionary-objective">
            <summary>View sermon objective</summary>
            <p>${escapeHtml(reading.objective)}</p>
          </details>
        ` : ""}
        ${reading.verificationNote ? `<p class="lectionary-verification">${escapeHtml(reading.verificationNote)}</p>` : ""}
      </article>
    `).join("");
  };

  monthSelect?.addEventListener("change", event => renderLectionaryMonth(event.target.value));
  renderLectionaryMonth(selectedMonth);
}

function renderPublicationBlocks(blocks = []) {
  return blocks.map(block => {
    if (block.type === "heading") return `<h2>${escapeHtml(block.text)}</h2>`;
    if (block.type === "lead") return `<p class="publication-lead">${escapeHtml(block.text)}</p>`;
    if (block.type === "scripture") return `
      <blockquote class="publication-scripture-block">
        <p>${escapeHtml(block.text)}</p>
        <cite>${escapeHtml(block.reference)}</cite>
      </blockquote>
    `;
    if (block.type === "callout") return `
      <aside class="publication-callout">
        <span>${escapeHtml(block.label || "Note")}</span>
        <h3>${escapeHtml(block.title)}</h3>
        <p>${escapeHtml(block.text || "")}</p>
      </aside>
    `;
    if (block.type === "list") return `<ul>${(block.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    return `<p>${escapeHtml(block.text || "")}</p>`;
  }).join("");
}

function renderGoodnewsTemplate(post) {
  const goodnews = post.goodnews || {};
  const service = goodnews.specialService;
  return `
    <section class="publication-template-section">
      <span class="eyebrow">Inside this edition</span>
      <div class="publication-edition-grid">
        ${goodnews.sundaySchool ? `
          <article class="publication-edition-card edition-yellow">
            <div class="meta">Sunday School Bible Study</div>
            <h3>${escapeHtml(goodnews.sundaySchool.topic)}</h3>
            <p>${escapeHtml(goodnews.sundaySchool.text)}</p>
          </article>
        ` : ""}
        ${service ? `
          <article class="publication-edition-card edition-red">
            <div class="meta">${escapeHtml(service.label)}</div>
            <h3>${escapeHtml(service.topic)}</h3>
            <p>${escapeHtml(service.text)}</p>
            <strong>${escapeHtml(service.revivalist || "")}</strong>
          </article>
        ` : ""}
      </div>
    </section>

    ${(goodnews.nextWeekMinisters || []).length ? `
      <section class="publication-template-section">
        <span class="eyebrow">Next week</span>
        <h2>Officiating ministers.</h2>
        <div class="publication-info-list">
          ${goodnews.nextWeekMinisters.map(item => `
            <div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>
          `).join("")}
        </div>
      </section>
    ` : ""}

    ${(goodnews.bibleMeditation || []).length ? `
      <section class="publication-template-section">
        <span class="eyebrow">Bible meditation</span>
        <h2>Read through the week.</h2>
        <div class="publication-meditation-grid">
          ${goodnews.bibleMeditation.map(item => `
            <div><span>${escapeHtml(item.day)}</span><strong>${escapeHtml(item.reading)}</strong></div>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderDevotionTemplate(post) {
  const devotion = post.devotion || {};
  return `
    <section class="publication-template-section devotion-response-section">
      <span class="eyebrow">Respond to the Word</span>
      <div class="devotion-response-grid">
        <article class="devotion-response-card devotion-prayer">
          <span>Prayer</span><p>${escapeHtml(devotion.prayer || "")}</p>
        </article>
        <article class="devotion-response-card devotion-declaration">
          <span>Declaration</span><p>${escapeHtml(devotion.declaration || "")}</p>
        </article>
        <article class="devotion-response-card devotion-action">
          <span>Action point</span><p>${escapeHtml(devotion.actionPoint || "")}</p>
        </article>
      </div>
    </section>
  `;
}

function renderSundaySchoolTemplate(post) {
  const lesson = post.sundaySchool || {};
  return `
    <section class="publication-template-section">
      <span class="eyebrow">Lesson objectives</span>
      <ol class="publication-objective-list">
        ${(lesson.objectives || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}
      </ol>
    </section>
    <section class="publication-template-section">
      <span class="eyebrow">Lesson outline</span>
      <div class="publication-outline-grid">
        ${(lesson.outline || []).map((item, index) => `
          <article>
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="publication-template-section publication-discussion-section">
      <span class="eyebrow">Discussion questions</span>
      <ul>${(lesson.questions || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${lesson.closingPrayer ? `<div class="publication-closing-prayer"><strong>Closing prayer</strong><p>${escapeHtml(lesson.closingPrayer)}</p></div>` : ""}
      <div class="publication-study-mode-cta">
        <a class="btn btn-primary" href="sunday-school.html">Open Interactive Sunday School</a>
      </div>
    </section>
  `;
}

function renderPublicationPost(content) {
  const posts = content.publications?.blog?.posts || [];
  const slug = new URLSearchParams(window.location.search).get("slug");
  const post = posts.find(item => item.slug === slug);
  const main = document.querySelector("main");

  if (!post) {
    if (main) {
      main.innerHTML = `
        <section class="section"><div class="container publication-not-found">
          <span class="eyebrow">Publication not found</span>
          <h1>This publication could not be opened.</h1>
          <p>Return to the publication archive and select an available article.</p>
          <a class="btn btn-primary" href="publications.html">View Publications</a>
        </div></section>
      `;
    }
    return;
  }

  document.title = `${post.title} | Peculiar Cherubs`;
  setText("[data-publication-post-type]", post.type);
  setText("[data-publication-post-title]", post.title);
  setText("[data-publication-post-excerpt]", post.excerpt);

  const meta = document.querySelector("[data-publication-post-meta]");
  if (meta) {
    meta.innerHTML = `
      <span>${escapeHtml(publicationDate(post.date))}</span>
      <span>${escapeHtml(post.author)}</span>
      <span>${escapeHtml(post.details?.readingTime || post.details?.edition || "Publication")}</span>
    `;
  }

  const cover = document.querySelector("[data-publication-post-cover]");
  if (cover) cover.innerHTML = publicationCover(post, "publication-article-cover");

  const tags = document.querySelector("[data-publication-post-tags]");
  if (tags) tags.innerHTML = (post.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("");

  const contentContainer = document.querySelector("[data-publication-post-content]");
  if (contentContainer) contentContainer.innerHTML = renderPublicationBlocks(post.blocks || []);

  const details = document.querySelector("[data-publication-post-details]");
  if (details) {
    details.innerHTML = Object.entries(post.details || {}).map(([key, value]) => `
      <div><dt>${escapeHtml(key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase()))}</dt><dd>${escapeHtml(value)}</dd></div>
    `).join("");
  }

  const templateContainer = document.querySelector("[data-publication-template-content]");
  if (templateContainer) {
    templateContainer.innerHTML = post.template === "goodnews"
      ? renderGoodnewsTemplate(post)
      : post.template === "devotion"
        ? renderDevotionTemplate(post)
        : post.template === "sundaySchool"
          ? renderSundaySchoolTemplate(post)
          : "";
  }

  const related = posts
    .filter(item => item.slug !== post.slug)
    .sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category))
    .slice(0, 3);
  const relatedContainer = document.querySelector("[data-related-publications]");
  if (relatedContainer) relatedContainer.innerHTML = related.map(publicationPostCard).join("");

  const copyButton = document.querySelector("[data-copy-publication-link]");
  copyButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyButton.textContent = "Link Copied";
      setTimeout(() => { copyButton.textContent = "Copy Article Link"; }, 1800);
    } catch {
      copyButton.textContent = "Copy unavailable";
    }
  });
}

function renderPublicationDetail(content) {
  const urlParams = new URLSearchParams(window.location.search);
  const issueKey = urlParams.get("issue") || "issue-01";
  const item = content.publications?.details?.[issueKey];

  if (!item) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = `
        <div class="container" style="padding: 6rem 1rem; text-align: center;">
          <h2>Publication Issue Not Found</h2>
          <p>The requested publication could not be loaded. Please return to the publications list.</p>
          <a class="btn btn-primary" href="publications.html" style="margin-top: 1.5rem; display: inline-block;">Back to Publications</a>
        </div>
      `;
    }
    return;
  }

  setText("[data-pub-meta-top]", `${item.type} · ${item.issue} · ${item.date}`);
  setText("[data-pub-title]", item.title);
  setText("[data-pub-subtitle]", item.subtitle);

  const hero = document.querySelector("[data-pub-hero-theme]");
  if (hero) {
    hero.classList.add(`publication-theme-${item.theme || "yellow"}`);
  }

  const contentContainer = document.querySelector("[data-pub-content]");
  if (contentContainer) {
    contentContainer.innerHTML = (item.content || [])
      .map(paragraph => `<p style="margin-bottom:1.5rem; line-height:1.75; font-size:1.15rem; color:var(--navy);">${escapeHtml(paragraph)}</p>`)
      .join("");
  }

  const pdfLink = document.querySelector("[data-pub-pdf]");
  if (pdfLink) {
    const pdfUrl = String(item.pdfUrl || "").trim();

    if (pdfUrl && pdfUrl !== "#") {
      pdfLink.href = pdfUrl;
      pdfLink.textContent = `Download ${item.issue} PDF`;
      pdfLink.classList.remove("coming-soon-btn");
      pdfLink.removeAttribute("aria-disabled");
    } else {
      pdfLink.removeAttribute("href");
      pdfLink.textContent = "PDF · Coming Soon";
      pdfLink.classList.add("coming-soon-btn");
      pdfLink.setAttribute("aria-disabled", "true");
    }
  }

  const scripturesContainer = document.querySelector("[data-pub-scriptures]");
  if (scripturesContainer) {
    scripturesContainer.innerHTML = (item.scriptures || []).map(scripture => `
      <article class="scripture-card" style="margin-bottom:1.2rem; padding:1.2rem; border-radius:16px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);">
        <strong style="display:block; font-size:0.95rem; color:var(--yellow); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.4rem;">${escapeHtml(scripture.ref)}</strong>
        <p style="font-size:0.95rem; line-height:1.5; color:rgba(255,255,255,0.85); margin:0;">“${escapeHtml(scripture.text)}”</p>
      </article>
    `).join("");
  }

  const announcementsContainer = document.querySelector("[data-pub-announcements]");
  if (announcementsContainer) {
    announcementsContainer.innerHTML = (item.announcements || []).map(announcement => `
      <li style="margin-bottom:0.8rem; font-size:0.95rem; line-height:1.5; color:var(--navy); padding-left:0.5rem; border-left:3px solid var(--red);">${escapeHtml(announcement)}</li>
    `).join("");
  }
}

function renderQuickLinks(content) {
  if (!content?.quickLinks) return;
  renderStandardHero(content.quickLinks);

  if (content.quickLinks.usefulLinks) {
    if (content.quickLinks.usefulLinks.eyebrow) setText("[data-quick-links-eyebrow]", content.quickLinks.usefulLinks.eyebrow);
    if (content.quickLinks.usefulLinks.title) setText("[data-quick-links-heading]", content.quickLinks.usefulLinks.title);
  }

  if (content.quickLinks.calendar) {
    if (content.quickLinks.calendar.eyebrow) setText("[data-quick-events-eyebrow]", content.quickLinks.calendar.eyebrow);
    if (content.quickLinks.calendar.title) setText("[data-quick-events-heading]", content.quickLinks.calendar.title);
  }

  const links = document.querySelector("[data-quick-links]");
  if (links) {
    links.innerHTML = (content.quickLinks.links || []).map(link => quickLinkCard(link)).join("");
  }

  const events = document.querySelector("[data-events-list]");
  if (events) {
    events.innerHTML = (content.quickLinks.events || []).map(event => `
      <article class="card">
        <div class="meta">${escapeHtml(event.frequency || "")}</div>
        <h3>${escapeHtml(event.title || "")}</h3>
        <p>${escapeHtml(event.text || "")}</p>
      </article>
    `).join("");
  }
}



function ministryCard(item) {
  return `
    <a class="ministry-card" href="${escapeHtml(item.href)}">
      <div class="ministry-card-image"
        style="background-image:url('${escapeHtml(item.image || "assets/logos/cross-radiance.png")}')">
      </div>
      <div class="ministry-card-body">
        <div class="meta">${escapeHtml(item.category)}</div>
        <h3>${escapeHtml(item.shortTitle || item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <span class="ministry-card-link">Explore ministry ↗</span>
      </div>
    </a>
  `;
}

function renderMinistries(content) {
  renderStandardHero(content.ministries);

  const mission = content.ministries.mission;
  setText("[data-ministry-mission-eyebrow]", mission.eyebrow);
  setText("[data-ministry-mission-title]", mission.title);
  setText("[data-ministry-mission-description]", mission.description);
  setText("[data-ministry-mission-vision]", mission.vision);

  const mandates = document.querySelector("[data-ministry-mandates]");
  if (mandates) {
    mandates.innerHTML = mission.mandates.map((item, index) => `
      <article class="ministry-mandate-card mandate-${index + 1}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.text)}</p>
      </article>
    `).join("");
  }

  const groups = document.querySelector("[data-ministry-groups]");
  if (groups) {
    groups.innerHTML = content.ministries.groups.map((group, index) => {
      const cards = group.items
        .map(key => content.ministries.details[key])
        .filter(Boolean)
        .map(item => ministryCard(item))
        .join("");

      return `
        <section class="section ${index % 2 ? "" : "section-soft"} ministry-group-section"
          id="${escapeHtml(group.id)}">
          <div class="container">
            <div class="section-head">
              <div>
                <span class="eyebrow">${escapeHtml(group.eyebrow)}</span>
                <h2>${escapeHtml(group.title)}</h2>
              </div>
              <p>${escapeHtml(group.description)}</p>
            </div>
            <div class="ministry-card-grid">${cards}</div>
          </div>
        </section>
      `;
    }).join("");
  }
}

function renderMinistryDetail(content) {
  const key = canonicalWorshipLocationKey(document.body.dataset.ministryKey);
  const isChapelDetail = document.body.dataset.page === "chapelDetail";
  const item = isChapelDetail
    ? content.chapels?.details?.[key]
    : content.ministries?.details?.[key];

  if (!item) {
    const entityType = isChapelDetail ? "chapel" : "ministry";
    throw new Error(`Unknown ${entityType} key: ${key}`);
  }

  setText("[data-ministry-detail-category]", item.category);
  setText("[data-ministry-detail-title]", item.title);
  setText("[data-ministry-detail-summary]", item.summary);

  const image = document.querySelector("[data-ministry-detail-image]");
  if (image) {
    image.style.backgroundImage = `url("${item.image || "assets/logos/cross-radiance.png"}")`;
    image.setAttribute("role", "img");
    image.setAttribute("aria-label", item.title);
  }

  const overview = document.querySelector("[data-ministry-detail-overview]");
  if (overview) {
    overview.innerHTML = (item.overview || [])
      .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  }

  const facts = document.querySelector("[data-ministry-detail-facts]");
  if (facts) {
    facts.innerHTML = (item.facts || []).map(fact => `
      <div class="ministry-fact">
        <span>${escapeHtml(fact.label)}</span>
        <strong>${escapeHtml(fact.value)}</strong>
      </div>
    `).join("");
  }

  const leadersSection = document.querySelector("[data-ministry-leaders-section]");
  const leaders = document.querySelector("[data-ministry-detail-leaders]");
  if (!item.leaders?.length) {
    leadersSection?.remove();
  } else if (leaders) {
    leaders.innerHTML = item.leaders.map((leader, index) => `
      <article class="ministry-leader-card">
        <div class="ministry-leader-number">${String(index + 1).padStart(2, "0")}</div>
        <h3>${escapeHtml(leader.name)}</h3>
        <p>${escapeHtml(leader.role)}</p>
      </article>
    `).join("");
  }

  const functionsSection = document.querySelector("[data-ministry-functions-section]");
  const functions = document.querySelector("[data-ministry-detail-functions]");
  if (!item.functions?.length) {
    functionsSection?.remove();
  } else if (functions) {
    setText("[data-ministry-functions-title]", item.functionsTitle || "What the ministry does");
    functions.innerHTML = item.functions.map((value, index) => `
      <article class="ministry-function-card">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <p>${escapeHtml(value)}</p>
      </article>
    `).join("");
  }

  if(isChapelDetail){
    const ch=broadcastChannels(content).find(c=>c.key===key), box=document.querySelector("[data-chapel-broadcast]"), sec=document.querySelector("[data-chapel-broadcast-section]"), head=document.querySelector("[data-chapel-broadcast-heading]"), hub=document.querySelector("[data-chapel-broadcast-hub-link]");
    if(head) head.textContent=`${item.shortTitle||item.title} online.`;
    if(hub) hub.href=`live.html?chapel=${encodeURIComponent(key)}`;
    if(ch&&box){box.innerHTML=broadcastMarkup(content,ch); if(sec)sec.hidden=false;} else if(sec)sec.hidden=true;
  }

  // Chapel Sermons: pull from the single church-wide Sermons archive.
  // A chapel page never owns a separate sermon collection.
  if (isChapelDetail) {
    const chapelSermonsSection = document.querySelector("[data-chapel-sermons-section]");
    const chapelSermonsList = document.querySelector("[data-chapel-sermons-list]");
    const chapelSermonsEmpty = document.querySelector("[data-chapel-sermons-empty]");
    const chapelSermonsTitle = document.querySelector("[data-chapel-sermons-title]");

    const allSermons = Array.isArray(content.sermons?.items)
      ? content.sermons.items
      : [];

    const chapelSermons = allSermons
      .filter(sermon => {
        const sermonChapelKey = canonicalWorshipLocationKey(
          sermon.chapelId ||
          sermon.chapelKey ||
          ""
        );
        return sermonChapelKey === key && sermon.published !== false;
      })
      .sort((a, b) => {
        const aDate = Date.parse(a.date || a.publishedAt || "") || 0;
        const bDate = Date.parse(b.date || b.publishedAt || "") || 0;
        return bDate - aDate;
      });

    if (chapelSermonsTitle) {
      chapelSermonsTitle.textContent =
        `Latest messages from ${item.shortTitle || item.title}.`;
    }

    if (chapelSermonsList) {
      chapelSermonsList.innerHTML = chapelSermons
        .slice(0, 3)
        .map(sermon => sermonCard(sermon, {
          chapelLabel: item.shortTitle || item.title
        }))
        .join("");
    }

    if (chapelSermonsEmpty) {
      chapelSermonsEmpty.hidden = chapelSermons.length > 0;
      chapelSermonsEmpty.textContent =
        `No published sermons from ${item.shortTitle || item.title} yet. New messages and completed livestreams will appear here when published.`;
    }

    if (chapelSermonsSection) {
      chapelSermonsSection.hidden = false;
    }
  }

  // Render Social Media Handles & Feed
  const socialSection = document.querySelector("[data-ministry-social-section]");
  const handlesContainer = document.querySelector("[data-ministry-social-handles]");
  const feedContainer = document.querySelector("[data-ministry-social-feed]");

  if (item.social) {
    if (handlesContainer && item.social.handles) {
      const handleIcons = {
        instagram: "📸 Instagram",
        youtube: "▶ YouTube",
        facebook: "👍 Facebook",
        tiktok: "🎵 TikTok",
        whatsapp: "💬 WhatsApp Channel"
      };

      handlesContainer.innerHTML = Object.entries(item.social.handles).map(([platform, url]) => `
        <a class="social-handle-btn platform-${platform}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
          ${handleIcons[platform] || platform} ↗
        </a>
      `).join("");
    }

    if (feedContainer) {
      const feed = (item.social.feed || []).filter(post => post.published !== false);

      if (feed.length > 0) {
        feedContainer.innerHTML = feed.map(post => `
          <article class="card social-post-card platform-${(post.platform || "").toLowerCase()}">
            <div class="social-post-thumb" style="background-image:url('${escapeHtml(post.thumbnail)}')">
              <span class="social-platform-pill platform-${(post.platform || "").toLowerCase()}">
                ${escapeHtml(post.platform)} · ${escapeHtml(post.type || 'Post')}
              </span>
            </div>
            <div class="social-post-body">
              <div class="meta">${escapeHtml(post.date || "")}</div>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.text)}</p>
              <a class="text-link social-post-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
                View on ${escapeHtml(post.platform)} ↗
              </a>
            </div>
          </article>
        `).join("");
      } else {
        feedContainer.innerHTML = `
          <div class="event-empty-state">No recent social media posts currently published for this ministry.</div>
        `;
      }
    }
  } else if (socialSection) {
    if (isChapelDetail) {
      socialSection.style.display = "";
      if (handlesContainer) handlesContainer.innerHTML = "";
      if (feedContainer) {
        feedContainer.innerHTML = `
          <div class="event-empty-state chapel-social-empty">
            Official social channels for ${escapeHtml(item.shortTitle || item.title)} have not been published yet.
          </div>
        `;
      }
    } else {
      socialSection.style.display = "none";
    }
  }
}

function renderHouseFellowships(content) {
  const fellowships = content.ministries.houseFellowships;
  const directory = document.querySelector("[data-house-directory]");
  const count = document.querySelector("[data-house-count]");
  const input = document.querySelector("[data-house-search]");
  const empty = document.querySelector("[data-house-empty]");

  if (count) count.textContent = String(fellowships.length);
  if (!directory) return;

  const render = value => {
    const query = String(value || "").trim().toLowerCase();
    const filtered = fellowships.filter(item =>
      [item.name, item.area, item.host, item.coordinator]
        .some(field => String(field).toLowerCase().includes(query))
    );

    directory.innerHTML = filtered.map((item, index) => `
      <article class="house-card">
        <div class="house-card-number">${String(index + 1).padStart(2, "0")}</div>
        <div class="meta">${escapeHtml(item.area)}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <dl>
          <div><dt>Host</dt><dd>${escapeHtml(item.host)}</dd></div>
          <div><dt>Coordinator</dt><dd>${escapeHtml(item.coordinator)}</dd></div>
        </dl>
      </article>
    `).join("");

    if (empty) empty.hidden = filtered.length > 0;
  };

  input?.addEventListener("input", event => render(event.target.value));
  render("");
}


function renderBibleCollege(content) {
  const school = content.bibleCollege;

  setText("[data-bible-hero-eyebrow]", school.hero.eyebrow);
  setMultilineText("[data-bible-hero-title]", school.hero.title);
  setText("[data-bible-hero-description]", school.hero.description);
  setLink("[data-bible-hero-primary]", school.hero.primaryButton);
  setLink("[data-bible-hero-secondary]", school.hero.secondaryButton);

  setText("[data-bible-intro-eyebrow]", school.introduction.eyebrow);
  setText("[data-bible-intro-title]", school.introduction.title);
  setText("[data-bible-intro-description]", school.introduction.description);

  const pathways = document.querySelector("[data-bible-pathways]");
  if (pathways) {
    pathways.innerHTML = school.pathways.map(item => `
      <article class="bible-pathway-card pathway-theme-${escapeHtml(item.theme)}">
        <div class="bible-pathway-icon">${escapeHtml(item.icon)}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.text)}</p>
        </div>
        <a href="${escapeHtml(item.href)}">${escapeHtml(item.button)} ↗</a>
      </article>
    `).join("");
  }

  const courses = document.querySelector("[data-bible-courses]");
  if (courses) {
    courses.innerHTML = school.courses.map(course => {
      const courseHref = String(course.href || "").trim();
      const hasCourseLink = courseHref && courseHref !== "#";

      return `
        <article class="card bible-course-card">
          <div class="meta">${escapeHtml(course.code)}</div>
          <h3>${escapeHtml(course.title)}</h3>
          <p>${escapeHtml(course.text)}</p>
          ${hasCourseLink
            ? `<a class="text-link" href="${escapeHtml(courseHref)}">${escapeHtml(course.button || "Course details")} ↗</a>`
            : `<span class="text-link coming-soon-link" aria-disabled="true">${escapeHtml(course.button || "Course details")} · Coming Soon</span>`
          }
        </article>
      `;
    }).join("");
  }

  const services = document.querySelector("[data-bible-services]");
  if (services) {
    services.innerHTML = school.studentServices.map(service => `
      <article class="bible-service-card">
        <div class="bible-service-icon">${escapeHtml(service.icon)}</div>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.text)}</p>
      </article>
    `).join("");
  }

  setText("[data-bible-registration-eyebrow]", school.registration.eyebrow);
  setText("[data-bible-registration-title]", school.registration.title);
  setText("[data-bible-registration-description]", school.registration.description);

  const registrationButton = document.querySelector("[data-bible-registration-button]");
  if (registrationButton) {
    const registrationHref = String(school.registration?.href || "").trim();
    const hasRegistrationLink = registrationHref && registrationHref !== "#";
    const label = school.registration?.button || "Open Registration Form";

    if (hasRegistrationLink) {
      registrationButton.textContent = label;
      registrationButton.href = registrationHref;
      registrationButton.classList.remove("coming-soon-btn");
      registrationButton.removeAttribute("aria-disabled");
    } else {
      registrationButton.textContent = `${label} · Coming Soon`;
      registrationButton.removeAttribute("href");
      registrationButton.classList.add("coming-soon-btn");
      registrationButton.setAttribute("aria-disabled", "true");
    }

    registrationButton.hidden = false;
  }

  const steps = document.querySelector("[data-bible-registration-steps]");
  if (steps) {
    steps.innerHTML = school.registration.steps.map((step, index) => `
      <div class="bible-registration-step">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <p>${escapeHtml(step)}</p>
      </div>
    `).join("");
  }

  setText("[data-bible-portal-eyebrow]", school.portal.eyebrow);
  setText("[data-bible-portal-title]", school.portal.title);
  setText("[data-bible-portal-description]", school.portal.description);

  const buttons = document.querySelector("[data-bible-portal-buttons]");
  if (buttons) {
    const portalButtons = school.portal?.buttons || [];

    buttons.innerHTML = portalButtons.map((button, index) => {
      const href = String(button?.href || "").trim();
      const hasLink = href && href !== "#";
      const cls = `btn ${index === 0 ? "btn-primary" : "btn-secondary"}`;

      return hasLink
        ? `<a class="${cls}" href="${escapeHtml(href)}">${escapeHtml(button.label)}</a>`
        : `<span class="${cls} coming-soon-btn" aria-disabled="true">${escapeHtml(button.label)} · Coming Soon</span>`;
    }).join("");

    buttons.hidden = portalButtons.length === 0;
  }
}


function parseEventDate(dateValue, timeValue = "00:00", endOfDay = false) {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = String(timeValue || "00:00").split(":").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    endOfDay && !timeValue ? 23 : (hour || 0),
    endOfDay && !timeValue ? 59 : (minute || 0),
    endOfDay && !timeValue ? 59 : 0
  );
}

function eventStart(event) {
  return parseEventDate(event.startDate, event.startTime);
}

function eventEnd(event) {
  return parseEventDate(
    event.endDate || event.startDate,
    event.endTime || event.startTime,
    event.allDay || (!event.endTime && !event.startTime)
  );
}

function eventDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEventSchedule(event) {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!start) return "";

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });

  const sameDate = start && end && eventDateKey(start) === eventDateKey(end);
  let dateText = dateFormatter.format(start);

  if (!sameDate && end) {
    dateText = `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
  }

  if (!event.allDay && event.startTime) {
    dateText += ` · ${timeFormatter.format(start)}`;
    if (event.endTime && end) dateText += `–${timeFormatter.format(end)}`;
  }

  return dateText;
}

function recurringOccurrencesForMonth(recurringItems, year, monthIndex) {
  const occurrences = [];
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  recurringItems.filter(item => item.published !== false).forEach(item => {
    let occurrenceNumber = 0;

    for (let day = 1; day <= lastDay; day += 1) {
      const date = new Date(year, monthIndex, day);
      if (date.getDay() !== Number(item.weekday)) continue;

      occurrenceNumber += 1;
      if (item.weekOfMonth && occurrenceNumber !== Number(item.weekOfMonth)) continue;

      const dateValue = eventDateKey(date);
      occurrences.push({
        ...item,
        id: `${item.id}-${dateValue}`,
        parentId: item.id,
        startDate: dateValue,
        endDate: dateValue,
        allDay: false,
        recurring: true
      });
    }
  });

  return occurrences;
}

function eventCard(event, type = "upcoming") {
  const links = Array.isArray(event.catchUpLinks) ? event.catchUpLinks : [];
  const linkMarkup = links.map(link => `
    <a class="text-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)} ↗</a>
  `).join("");

  return `
    <article class="event-list-card event-category-${escapeHtml(event.category || "event").toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}">
      <div class="meta">${escapeHtml(event.category || "Event")}</div>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="event-list-date">${escapeHtml(formatEventSchedule(event))}</p>
      <p>${escapeHtml(event.description || "")}</p>
      <div class="event-card-actions">
        <button class="text-link event-detail-button" type="button" data-open-event="${escapeHtml(event.id)}">View details ↗</button>
        ${type === "catchup" ? linkMarkup : ""}
      </div>
    </article>
  `;
}

function renderEvents(content) {
  renderStandardHero(content.events);

  const eventContent = content.events || {};
  const specialEvents = (eventContent.items || []).filter(item => item.published !== false);
  const recurringItems = (eventContent.recurring || []).filter(item => item.published !== false);
  const now = new Date();

  const upcoming = specialEvents
    .filter(item => eventEnd(item) >= now)
    .sort((a, b) => eventStart(a) - eventStart(b));

  const past = specialEvents
    .filter(item => eventEnd(item) < now)
    .sort((a, b) => eventEnd(b) - eventEnd(a));

  const nextEvent = upcoming.find(item => eventStart(item) <= now && eventEnd(item) >= now)
    || upcoming[0];

  const runtimeEvents = new Map(specialEvents.map(item => [item.id, item]));
  let selectedDialogEvent = null;

  const nextCard = document.querySelector("[data-next-event]");
  if (!nextEvent) {
    nextCard?.classList.add("event-watch-empty");
    setText("[data-next-event-status]", "Calendar update");
    setText("[data-next-event-title]", "No upcoming special event is currently published.");
    setText("[data-next-event-description]", "Regular weekly services remain available in the calendar below.");
  } else {
    const ongoing = eventStart(nextEvent) <= now && eventEnd(nextEvent) >= now;
    setText("[data-next-event-status]", ongoing ? "Happening now" : "Next special event");
    setText("[data-next-event-title]", nextEvent.title);
    setText("[data-next-event-description]", nextEvent.description);

    const meta = document.querySelector("[data-next-event-meta]");
    if (meta) {
      meta.innerHTML = `
        <span>${escapeHtml(formatEventSchedule(nextEvent))}</span>
        ${nextEvent.location ? `<span>${escapeHtml(nextEvent.location)}</span>` : ""}
        <button class="text-link event-detail-button" type="button" data-open-event="${escapeHtml(nextEvent.id)}">View details ↗</button>
      `;
    }

    const countdown = document.querySelector("[data-next-event-countdown]");
    const updateCountdown = () => {
      if (!countdown) return;
      const difference = eventStart(nextEvent) - new Date();

      if (difference <= 0 && eventEnd(nextEvent) >= new Date()) {
        countdown.innerHTML = `<strong>NOW</strong><span>Join the programme</span>`;
        return;
      }

      if (difference <= 0) {
        countdown.innerHTML = `<strong>DONE</strong><span>See Catch Up below</span>`;
        return;
      }

      const days = Math.floor(difference / 86400000);
      const hours = Math.floor((difference % 86400000) / 3600000);
      const minutes = Math.floor((difference % 3600000) / 60000);
      countdown.innerHTML = `
        <strong>${days > 0 ? `${days}d` : `${hours}h`}</strong>
        <span>${days > 0 ? `${hours} hours remaining` : `${minutes} minutes remaining`}</span>
      `;
    };

    updateCountdown();
    setInterval(updateCountdown, 60000);
  }

  const upcomingContainer = document.querySelector("[data-upcoming-events]");
  const upcomingEmpty = document.querySelector("[data-upcoming-empty]");
  if (upcomingContainer) {
    upcomingContainer.innerHTML = upcoming.slice(0, 9).map(item => eventCard(item)).join("");
  }
  if (upcomingEmpty) upcomingEmpty.hidden = upcoming.length > 0;

  const catchupContainer = document.querySelector("[data-catchup-events]");
  const catchupToggle = document.querySelector("[data-catchup-toggle]");
  let catchupExpanded = false;

  const renderCatchup = () => {
    if (!catchupContainer) return;
    const visible = catchupExpanded ? past : past.slice(0, 6);
    catchupContainer.innerHTML = visible.map(item => eventCard(item, "catchup")).join("");

    if (catchupToggle) {
      catchupToggle.hidden = past.length <= 6;
      catchupToggle.textContent = catchupExpanded ? "Show fewer past events" : "Show all past events";
    }
  };

  catchupToggle?.addEventListener("click", () => {
    catchupExpanded = !catchupExpanded;
    renderCatchup();
  });
  renderCatchup();

  const rhythm = document.querySelector("[data-weekly-rhythm]");
  if (rhythm) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    rhythm.innerHTML = recurringItems.map(item => `
      <article class="weekly-rhythm-card">
        <div class="weekly-rhythm-day">${escapeHtml(dayNames[item.weekday])}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.startTime)}${item.endTime ? `–${escapeHtml(item.endTime)}` : ""}</p>
        ${item.weekOfMonth ? `<span>First ${escapeHtml(dayNames[item.weekday])} monthly</span>` : `<span>Every ${escapeHtml(dayNames[item.weekday])}</span>`}
      </article>
    `).join("");
  }

  const socialFeed = (eventContent.socialFeed || []).filter(item => item.published !== false);
  const socialContainer = document.querySelector("[data-event-social-feed]");
  const socialEmpty = document.querySelector("[data-social-feed-empty]");

  setText("[data-social-notice-title]", eventContent.socialFeedNotice?.title || "");
  setText("[data-social-notice-text]", eventContent.socialFeedNotice?.text || "");

  if (socialContainer) {
    socialContainer.innerHTML = socialFeed.map(item => {
      const target = item.placeholder ? "" : ' target="_blank" rel="noopener"';
      const cardClass = item.placeholder ? "social-event-card social-placeholder-card" : "social-event-card";
      return `
        <a class="${cardClass}" href="${escapeHtml(item.url)}"${target}>
          ${item.thumbnail ? `<div class="social-event-thumb" style="background-image:url('${escapeHtml(item.thumbnail)}')"></div>` : ""}
          <div>
            <div class="meta">${escapeHtml(item.platform || item.type || "Media")}</div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text || "")}</p>
            <span>${item.placeholder ? "Placeholder preview" : "Open post ↗"}</span>
          </div>
        </a>
      `;
    }).join("");
  }

  if (socialEmpty) {
    socialEmpty.hidden = socialFeed.length > 0;
    setText("[data-social-empty-title]", eventContent.socialFeedEmpty?.title);
    setText("[data-social-empty-text]", eventContent.socialFeedEmpty?.text);
  }

  const calendar = document.querySelector("[data-event-calendar]");
  const calendarMonth = document.querySelector("[data-calendar-month]");
  const categoryFilter = document.querySelector("[data-calendar-filter]");
  const categories = [...new Set([
    ...specialEvents.map(item => item.category),
    ...recurringItems.map(item => item.category)
  ].filter(Boolean))].sort();

  if (categoryFilter) {
    categoryFilter.innerHTML = `
      <option value="all">All events</option>
      ${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
    `;
  }

  const today = new Date();
  const defaultParts = String(eventContent.defaultMonth || "").split("-").map(Number);
  let viewDate = (
    specialEvents.some(item => eventStart(item)?.getFullYear() === today.getFullYear())
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(defaultParts[0] || today.getFullYear(), (defaultParts[1] || today.getMonth() + 1) - 1, 1)
  );

  const renderCalendar = () => {
    if (!calendar) return;
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const filterValue = categoryFilter?.value || "all";
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(viewDate);
    if (calendarMonth) calendarMonth.textContent = monthName;

    const theme = (eventContent.monthlyThemes || []).find(item =>
      item.month.toLowerCase() === new Intl.DateTimeFormat("en-US", { month: "long" }).format(viewDate).toLowerCase()
    );

    setText("[data-calendar-quarter]", theme?.quarterAim || "");
    setText("[data-calendar-theme]", theme?.centralTheme || "");
    setText("[data-calendar-declaration]", theme?.declaration || "");

    const recurringOccurrences = recurringOccurrencesForMonth(recurringItems, year, month);
    recurringOccurrences.forEach(item => runtimeEvents.set(item.id, item));

    const monthEvents = [...specialEvents, ...recurringOccurrences].filter(item => {
      const start = eventStart(item);
      const end = eventEnd(item);
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
      const inMonth = start <= monthEnd && end >= monthStart;
      return inMonth && (filterValue === "all" || item.category === filterValue);
    });

    const eventMap = new Map();
    monthEvents.forEach(item => {
      const start = eventStart(item);
      const end = eventEnd(item);
      if (!start || !end) return;

      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      while (cursor <= endDay) {
        if (cursor.getFullYear() === year && cursor.getMonth() === month) {
          const key = eventDateKey(cursor);
          if (!eventMap.has(key)) eventMap.set(key, []);
          eventMap.get(key).push(item);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      const dayNumber = index - firstWeekday + 1;
      let cellDate;
      let outside = false;

      if (dayNumber < 1) {
        cellDate = new Date(year, month - 1, previousMonthDays + dayNumber);
        outside = true;
      } else if (dayNumber > daysInMonth) {
        cellDate = new Date(year, month + 1, dayNumber - daysInMonth);
        outside = true;
      } else {
        cellDate = new Date(year, month, dayNumber);
      }

      const key = eventDateKey(cellDate);
      const dayEvents = outside ? [] : (eventMap.get(key) || []);
      const isToday = key === eventDateKey(new Date());

      cells.push(`
        <div class="calendar-day${outside ? " outside-month" : ""}${isToday ? " calendar-today-cell" : ""}">
          <span class="calendar-day-number">${cellDate.getDate()}</span>
          <div class="calendar-day-events">
            ${dayEvents.slice(0, 3).map(item => `
              <button class="calendar-event-chip${item.recurring ? " recurring-chip" : ""}"
                type="button"
                data-open-event="${escapeHtml(item.id)}"
                title="${escapeHtml(item.title)}">
                ${escapeHtml(item.title)}
              </button>
            `).join("")}
            ${dayEvents.length > 3 ? `<span class="calendar-more">+${dayEvents.length - 3} more</span>` : ""}
          </div>
        </div>
      `);
    }

    calendar.innerHTML = `
      <div class="calendar-weekdays">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-days">${cells.join("")}</div>
    `;
  };

  document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderCalendar();
  });

  document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderCalendar();
  });

  document.querySelector("[data-calendar-today]")?.addEventListener("click", () => {
    viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    renderCalendar();
  });

  categoryFilter?.addEventListener("change", renderCalendar);
  renderCalendar();

  const dialog = document.querySelector("[data-event-dialog]");
  const dialogLinks = document.querySelector("[data-dialog-links]");

  const openDialog = event => {
    if (!event || !dialog) return;
    selectedDialogEvent = event;
    setText("[data-dialog-category]", event.category || "Event");
    setText("[data-dialog-title]", event.title);
    setText("[data-dialog-description]", event.description || "");

    const meta = document.querySelector("[data-dialog-meta]");
    if (meta) {
      meta.innerHTML = `
        <span>${escapeHtml(formatEventSchedule(event))}</span>
        ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
        ${event.recurring ? `<span>Recurring event</span>` : ""}
      `;
    }

    if (dialogLinks) {
      const links = Array.isArray(event.catchUpLinks) ? event.catchUpLinks : [];
      dialogLinks.innerHTML = links.map(link => `
        <a class="text-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)} ↗</a>
      `).join("");
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  };

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-open-event]");
    if (!trigger) return;
    const selected = runtimeEvents.get(trigger.dataset.openEvent);
    openDialog(selected);
  });

  document.querySelector("[data-event-dialog-close]")?.addEventListener("click", () => dialog?.close());
  dialog?.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  document.querySelector("[data-dialog-calendar]")?.addEventListener("click", () => {
    if (!selectedDialogEvent) return;

    const clean = value => String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;")
      .replaceAll("\n", "\\n");

    const formatIcsDate = (date, allDay) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      if (allDay) return `${y}${m}${d}`;
      const h = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      return `${y}${m}${d}T${h}${min}00`;
    };

    const start = eventStart(selectedDialogEvent);
    const end = eventEnd(selectedDialogEvent) || start;
    const allDay = Boolean(selectedDialogEvent.allDay);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Peculiar Cherubs//Events//EN",
      "BEGIN:VEVENT",
      `UID:${clean(selectedDialogEvent.id)}@peculiarcherubs.org`,
      allDay
        ? `DTSTART;VALUE=DATE:${formatIcsDate(start, true)}`
        : `DTSTART;TZID=Africa/Lagos:${formatIcsDate(start, false)}`,
      allDay
        ? `DTEND;VALUE=DATE:${formatIcsDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1), true)}`
        : `DTEND;TZID=Africa/Lagos:${formatIcsDate(end, false)}`,
      `SUMMARY:${clean(selectedDialogEvent.title)}`,
      `DESCRIPTION:${clean(selectedDialogEvent.description)}`,
      `LOCATION:${clean(selectedDialogEvent.location)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedDialogEvent.id}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

function renderGive(content) {
  const giveData = content.give || {};
  renderStandardHero(giveData);
  setText("[data-give-why-eyebrow]", giveData.why?.eyebrow || "Why we give");
  setText("[data-give-why-title]", giveData.why?.title || "Giving is worship.");
  setText("[data-give-why-description]", giveData.why?.description || "");
  setText("[data-give-why-quote]", giveData.why?.quote ? `“${giveData.why.quote}”` : "");

  const escapeStr = (str) => {
    if (typeof str !== "string") return str == null ? "" : String(str);
    return str.replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  };

  // Legacy fallback if data-give-options exists
  const legacyOptions = document.querySelector("[data-give-options]");
  if (legacyOptions && Array.isArray(giveData.options)) {
    legacyOptions.innerHTML = giveData.options.map(option => `
      <a class="give-option" href="${escapeStr(option.href)}">
        <span>${escapeStr(option.label)}</span>
        <b>↗</b>
      </a>
    `).join("");
  }

  const hub = document.getElementById("giving-hub");
  if (!hub) return;

  // State
  let activeCurrency = giveData.defaultCurrency || "NGN";
  const currencies = Array.isArray(giveData.currencies) && giveData.currencies.length
    ? giveData.currencies
    : [
      { code: "NGN", label: "₦ NGN", name: "Nigerian Naira", isPrimary: true },
      { code: "USD", label: "$ USD", name: "US Dollar", isPrimary: false },
      { code: "GBP", label: "£ GBP", name: "British Pound", isPrimary: false },
      { code: "EUR", label: "€ EUR", name: "Euro", isPrimary: false }
    ];

  const bankAccounts = Array.isArray(giveData.bankAccounts) ? giveData.bankAccounts : [];
  const givingLocations = worshipLocationRegistry(content);
  let activeGivingLocation = givingLocations[0]?.id || "peculiar-hq";
  const categories = Array.isArray(giveData.categories) && giveData.categories.length
    ? giveData.categories
    : ["Tithe", "Sunday Offering", "Thanksgiving", "First Fruit", "Welfare & Benevolence", "Special Project"];
  const presetsMap = giveData.amountPresets || {
    NGN: [2000, 5000, 10000, 25000, 50000],
    USD: [20, 50, 100, 250, 500],
    GBP: [20, 50, 100, 200, 400],
    EUR: [20, 50, 100, 200, 400]
  };
  const projects = Array.isArray(giveData.projects) ? giveData.projects : [];

  const currencySymbols = {
    NGN: "₦",
    USD: "$",
    GBP: "£",
    EUR: "€"
  };

  // 1. Toast Notification Helper
  let toastTimer = null;
  const showToast = (message) => {
    const toast = document.getElementById("give-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  };

  // 2. Tab Navigation
  const tabs = hub.querySelectorAll(".give-tab");
  const tabPanes = hub.querySelectorAll(".give-tab-pane");

  const switchTab = (targetTabId) => {
    tabs.forEach(tab => {
      const isSelected = tab.getAttribute("data-give-tab") === targetTabId;
      tab.classList.toggle("active", isSelected);
      tab.setAttribute("aria-selected", isSelected ? "true" : "false");
    });

    tabPanes.forEach(pane => {
      if (pane.id === `pane-${targetTabId}`) {
        pane.style.display = "block";
        pane.classList.add("active");
      } else {
        pane.style.display = "none";
        pane.classList.remove("active");
      }
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-give-tab");
      if (tabId) switchTab(tabId);
    });
  });

  // 3. Canonical Giving Location + Bank Transfer Accounts & Currency Filter
  const locationSelect = document.getElementById("give-location");
  if (locationSelect) {
    locationSelect.innerHTML = givingLocations.map(location => `
      <option value="${escapeStr(location.id)}">${escapeStr(location.label)}</option>
    `).join("");

    if (activeGivingLocation) {
      locationSelect.value = activeGivingLocation;
    }

    locationSelect.addEventListener("change", () => {
      activeGivingLocation = canonicalWorshipLocationKey(locationSelect.value);
      renderBankAccounts();
    });
  }

  const currencyPillsContainer = hub.querySelector("[data-give-currency-pills]");
  const accountsContainer = hub.querySelector("[data-give-accounts-list]");

  const renderCurrencyPills = () => {
    if (!currencyPillsContainer) return;
    currencyPillsContainer.innerHTML = currencies.map(c => `
      <button type="button" class="give-currency-pill ${c.code === activeCurrency ? 'active' : ''}" data-currency="${escapeStr(c.code)}">
        ${escapeStr(c.label || c.code)}
      </button>
    `).join("");

    currencyPillsContainer.querySelectorAll(".give-currency-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        activeCurrency = pill.getAttribute("data-currency");
        renderCurrencyPills();
        renderBankAccounts();
      });
    });
  };

  const renderBankAccounts = () => {
    if (!accountsContainer) return;
    const filtered = bankAccounts.filter(a => {
      const currencyMatch =
        (a.currency || "NGN").toUpperCase() === activeCurrency.toUpperCase();

      const accountLocation = canonicalWorshipLocationKey(
        a.locationId || a.chapelId || a.location || ""
      );

      const locationMatch =
        !accountLocation ||
        accountLocation === "all" ||
        accountLocation === "*" ||
        accountLocation === activeGivingLocation;

      return currencyMatch && locationMatch;
    });

    if (!filtered.length) {
      accountsContainer.innerHTML = `
        <div style="background:rgba(255,255,255,0.06); border-radius:12px; padding:1.5rem; text-align:center;">
          <p style="margin:0; color:rgba(255,255,255,0.7); font-size:0.9rem;">
            No ${escapeStr(activeCurrency)} accounts are currently listed for ${escapeStr(
              givingLocations.find(location => location.id === activeGivingLocation)?.label || "this location"
            )}. Please contact the church office for direct giving instructions.
          </p>
        </div>
      `;
      return;
    }

    accountsContainer.innerHTML = filtered.map(a => `
      <div class="give-account-card">
        <div class="give-account-header">
          <h4 class="give-account-title">${escapeStr(a.title || a.accountName)}</h4>
          ${a.isPrimary ? '<span class="give-account-badge">Primary</span>' : ''}
        </div>
        <div class="give-bank-name">${escapeStr(a.bankName)}</div>
        <div class="give-number-row">
          <span class="give-account-number">${escapeStr(a.accountNumber)}</span>
          <button type="button" class="give-copy-btn" data-copy-val="${escapeStr(a.accountNumber)}" aria-label="Copy account number">
            <span>📋 Copy</span>
          </button>
        </div>
        <div class="give-account-meta-row">
          <span>Account Name: <strong>${escapeStr(a.accountName)}</strong></span>
          ${a.sortCode ? `<span>Sort Code: <strong>${escapeStr(a.sortCode)}</strong></span>` : ''}
          ${a.swiftCode ? `<span>SWIFT / BIC: <strong>${escapeStr(a.swiftCode)}</strong></span>` : ''}
        </div>
        ${a.narrationGuide ? `<p class="give-account-guide">${escapeStr(a.narrationGuide)}</p>` : ''}
      </div>
    `).join("");

    // Wire up Copy Buttons
    accountsContainer.querySelectorAll(".give-copy-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const val = btn.getAttribute("data-copy-val");
        if (!val) return;

        let success = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(val);
            success = true;
          } catch (e) {
            // fallback below
          }
        }
        if (!success) {
          try {
            const ta = document.createElement("textarea");
            ta.value = val;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            success = true;
          } catch (err) {
            console.warn("Copy failed:", err);
          }
        }

        if (success) {
          const origHtml = btn.innerHTML;
          btn.innerHTML = "<span>✓ Copied!</span>";
          btn.classList.add("copied");
          showToast(`Account number copied: ${val}`);
          setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.classList.remove("copied");
          }, 2000);
        }
      });
    });
  };

  renderCurrencyPills();
  renderBankAccounts();

  // WhatsApp Notification Button
  const waBtn = hub.querySelector("[data-give-whatsapp-btn]");
  if (waBtn) {
    const waPhone = String(giveData.whatsappConfirmPhone || "").replace(/[^0-9]/g, "");
    const waText = giveData.whatsappConfirmText || "Hello Peculiar Cherubs Finance Team, I have just completed a transfer for my giving. Here are the details:";

    if (waPhone) {
      waBtn.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;
      waBtn.hidden = false;
    } else {
      waBtn.removeAttribute("href");
      waBtn.hidden = true;
    }
  }

  // 4. Online Giving Form & Amount Presets
  const purposeSelect = document.getElementById("give-purpose");
  if (purposeSelect) {
    purposeSelect.innerHTML = categories.map(cat => `
      <option value="${escapeStr(cat)}">${escapeStr(cat)}</option>
    `).join("");
  }

  const onlineCurrencySelect = document.getElementById("give-online-currency");
  const presetsContainer = hub.querySelector("[data-give-presets-container]");
  const amountInput = document.getElementById("give-amount");
  const currencyCodeLabel = hub.querySelector("[data-active-currency-code]");
  const currencySymbolLabel = hub.querySelector("[data-active-currency-symbol]");

  const renderPresets = (curr) => {
    if (!presetsContainer) return;
    const presetsList = presetsMap[curr] || presetsMap.NGN || [2000, 5000, 10000, 25000, 50000];
    const sym = currencySymbols[curr] || "₦";

    presetsContainer.innerHTML = presetsList.map(val => `
      <button type="button" class="give-preset-chip" data-preset-val="${val}">
        ${sym}${Number(val).toLocaleString()}
      </button>
    `).join("") + `
      <button type="button" class="give-preset-chip" data-preset-custom="true">Custom</button>
    `;

    presetsContainer.querySelectorAll(".give-preset-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        presetsContainer.querySelectorAll(".give-preset-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");

        if (chip.getAttribute("data-preset-custom") === "true") {
          amountInput.value = "";
          amountInput.focus();
        } else {
          const val = chip.getAttribute("data-preset-val");
          amountInput.value = val;
        }
      });
    });
  };

  const updateOnlineCurrency = (curr) => {
    if (currencyCodeLabel) currencyCodeLabel.textContent = curr;
    const sym = currencySymbols[curr] || "₦";
    if (currencySymbolLabel) currencySymbolLabel.textContent = sym;
    renderPresets(curr);
  };

  if (onlineCurrencySelect) {
    onlineCurrencySelect.addEventListener("change", (e) => {
      updateOnlineCurrency(e.target.value);
    });
  }

  // Initialize presets for default NGN
  updateOnlineCurrency("NGN");

  // Online form submission & graceful gateway notice modal
  const onlineForm = document.getElementById("give-online-form");
  const modalOverlay = document.getElementById("give-gateway-modal");
  const modalSwitchBtn = document.getElementById("btn-modal-switch-transfer");
  const modalCloseBtn = document.getElementById("btn-modal-close");

  const gateway = giveData.paymentGateway || {};

  const submitBtnSpan = onlineForm?.querySelector(".give-submit-btn span");
  if (submitBtnSpan && gateway.buttonLabel) {
    submitBtnSpan.textContent = gateway.buttonLabel;
  }

  const openModal = () => {
    if (!modalOverlay) return;
    if (gateway.noticeMessage) {
      const modalBody = modalOverlay.querySelector(".give-modal-body");
      if (modalBody) {
        modalBody.innerHTML = `<p>${escapeStr(gateway.noticeMessage)}</p>`;
      }
    }
    modalOverlay.style.display = "flex";
    modalOverlay.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    if (!modalOverlay) return;
    modalOverlay.style.display = "none";
    modalOverlay.setAttribute("aria-hidden", "true");
  };

  if (onlineForm) {
    onlineForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const amountVal = parseFloat(amountInput.value);
      const nameVal = (document.getElementById("give-name")?.value || "").trim();
      const emailVal = (document.getElementById("give-email")?.value || "").trim();
      const phoneVal = (document.getElementById("give-phone")?.value || "").trim();
      const purposeVal = purposeSelect?.value || "Giving";
      const locationVal = canonicalWorshipLocationKey(
        locationSelect?.value || activeGivingLocation
      );

      if (!locationVal || !givingLocations.some(location => location.id === locationVal)) {
        alert("Please select a valid giving location.");
        locationSelect?.focus();
        return;
      }

      if (!amountVal || amountVal <= 0) {
        alert("Please enter a valid donation amount.");
        amountInput.focus();
        return;
      }
      if (!nameVal) {
        alert("Please enter your full name.");
        document.getElementById("give-name")?.focus();
        return;
      }
      if (!emailVal || !emailVal.includes("@")) {
        alert("Please enter a valid email address.");
        document.getElementById("give-email")?.focus();
        return;
      }

      // Check if a payment gateway link is enabled and configured
      if (gateway.enabled && gateway.paymentUrl && gateway.paymentUrl.trim().length > 0) {
        let targetUrl = gateway.paymentUrl.trim();
        if (gateway.appendDonorParams === true) {
          const currencyVal = onlineCurrencySelect?.value || activeCurrency || "NGN";
          try {
            const u = new URL(targetUrl, window.location.href);
            u.searchParams.set("amount", String(amountVal));
            u.searchParams.set("currency", currencyVal);
            u.searchParams.set("purpose", purposeVal);
            targetUrl = u.toString();
          } catch (err) {
            const sep = targetUrl.includes("?") ? "&" : "?";
            targetUrl = `${targetUrl}${sep}amount=${encodeURIComponent(amountVal)}&currency=${encodeURIComponent(currencyVal)}&purpose=${encodeURIComponent(purposeVal)}`;
          }
        }

        showToast("Redirecting to secure payment checkout...");
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // Gateway not enabled or URL not set: show graceful fallback modal
      openModal();
    });
  }

  if (modalSwitchBtn) {
    modalSwitchBtn.addEventListener("click", () => {
      closeModal();
      switchTab("bank-transfer");
      hub.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // 5. Special Projects Pane
  const projectsContainer = hub.querySelector("[data-give-projects-list]");
  if (projectsContainer && projects.length) {
    projectsContainer.innerHTML = projects.map(p => `
      <div class="give-project-card">
        ${p.badge ? `<span class="give-project-badge">${escapeStr(p.badge)}</span>` : ''}
        <h4>${escapeStr(p.title)}</h4>
        <p>${escapeStr(p.description)}</p>
        <button type="button" class="give-project-action-btn" data-project-title="${escapeStr(p.title)}">
          Give to this Project ↗
        </button>
      </div>
    `).join("");

    projectsContainer.querySelectorAll(".give-project-action-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-project-title");
        switchTab("online-giving");

        if (purposeSelect) {
          let found = false;
          for (let i = 0; i < purposeSelect.options.length; i++) {
            if (purposeSelect.options[i].value === title) {
              purposeSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement("option");
            opt.value = title;
            opt.textContent = title;
            opt.selected = true;
            purposeSelect.appendChild(opt);
          }
        }
        hub.scrollIntoView({ behavior: "smooth", block: "start" });
        amountInput?.focus();
      });
    });
  }
}

function renderSundaySchoolDetail(content) {
  const details = content.publications?.sundaySchoolDetails;
  if (!details || !details.lessons) {
    console.error("Sunday School details data is missing in site-content.json.");
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const lessonKey = urlParams.get("lesson") || details.currentLesson || Object.keys(details.lessons)[0];
  const lesson = details.lessons[lessonKey] || details.lessons[details.currentLesson] || Object.values(details.lessons)[0];

  if (!lesson) return;

  // Header Hero Elements
  setText("[data-ss-eyebrow]", "Publications · Sunday School");
  setText("[data-ss-quarter]", details.quarter || "Quarter 3, 2026");
  setText("[data-ss-lesson-num]", `Lesson ${lesson.lessonNumber}`);
  setText("[data-ss-title]", lesson.topic);
  setText("[data-ss-subtitle]", lesson.subtitle || "");
  setText("[data-ss-date]", lesson.dateDisplay || lesson.date);
  setText("[data-ss-verse-ref]", lesson.memoryVerse?.reference || "");
  setText("[data-ss-audience]", lesson.targetAudience || "General");
  setText("[data-ss-duration]", lesson.duration || "45 Mins");
  setText("[data-ss-volume-title]", details.volume || "2026 Headquarters Curriculum");

  // PDF Link
  const pdfBtn = document.querySelector("[data-ss-pdf-btn]");
  if (pdfBtn) {
    const pdfUrl = String(lesson.pdfUrl || "").trim();

    if (pdfUrl && pdfUrl !== "#") {
      pdfBtn.href = pdfUrl;
      pdfBtn.textContent = "📥 PDF";
      pdfBtn.classList.remove("coming-soon-btn");
      pdfBtn.removeAttribute("aria-disabled");
      pdfBtn.removeAttribute("title");
    } else {
      pdfBtn.removeAttribute("href");
      pdfBtn.textContent = "📥 PDF · Coming Soon";
      pdfBtn.classList.add("coming-soon-btn");
      pdfBtn.setAttribute("aria-disabled", "true");
      pdfBtn.title = "PDF version coming soon";
    }
  }

  // Populate Lesson Selector Dropdown
  const lessonSelect = document.querySelector("[data-ss-lesson-select]");
  if (lessonSelect) {
    lessonSelect.innerHTML = Object.values(details.lessons).map(l => `
      <option value="${l.id}" ${l.id === lesson.id ? "selected" : ""}>
        Lesson ${l.lessonNumber}: ${escapeHtml(l.topic)} (${l.date})
      </option>
    `).join("");

    lessonSelect.addEventListener("change", e => {
      const selected = e.target.value;
      window.location.href = `sunday-school.html?lesson=${selected}`;
    });
  }

  // Populate Side Rail Curriculum Lessons List
  const sideLessonList = document.querySelector("[data-ss-lesson-list]");
  if (sideLessonList) {
    sideLessonList.innerHTML = Object.values(details.lessons).map(l => `
      <li class="${l.id === lesson.id ? "active" : ""}">
        <a href="sunday-school.html?lesson=${l.id}">
          <span class="ss-side-num">L${l.lessonNumber}</span>
          <div class="ss-side-info">
            <strong>${escapeHtml(l.topic)}</strong>
            <small>${escapeHtml(l.date)}</small>
          </div>
        </a>
      </li>
    `).join("");
  }

  // Populate Class Flow Schedule List
  const scheduleList = document.querySelector("[data-ss-schedule-list]");
  if (scheduleList && lesson.teacherNotes?.classFlow) {
    scheduleList.innerHTML = lesson.teacherNotes.classFlow.map(step => `
      <li>
        <span class="ss-schedule-time">${escapeHtml(step.time)}</span>
        <span class="ss-schedule-phase">${escapeHtml(step.phase)}</span>
      </li>
    `).join("");
  }

  // Render Main Content
  const contentContainer = document.querySelector("[data-ss-content]");
  if (contentContainer) {
    let mainHtml = "";

    // 1. Memory Verse & Golden Text Section
    if (lesson.memoryVerse) {
      const verseText = lesson.memoryVerse.text;
      const wordsToHide = lesson.memoryVerse.keywordsToHide || [];

      let hiddenVerseText = verseText;
      wordsToHide.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        hiddenVerseText = hiddenVerseText.replace(regex, "______");
      });

      mainHtml += `
        <article id="ss-section-verse" class="ss-card ss-verse-card">
          <div class="ss-card-header">
            <span class="eyebrow" style="color:var(--yellow)">Memory Verse & Recitation</span>
            <button type="button" class="ss-drill-btn" data-ss-toggle-drill>
              <span class="ss-drill-icon">👁️</span> <span data-ss-drill-text>Practice Recitation (Hide Words)</span>
            </button>
          </div>

          <blockquote class="ss-verse-quote">
            <p class="ss-verse-full" data-ss-verse-full>“${escapeHtml(verseText)}”</p>
            <p class="ss-verse-hidden hidden" data-ss-verse-hidden>“${escapeHtml(hiddenVerseText)}”</p>
            <cite>— ${escapeHtml(lesson.memoryVerse.reference)}</cite>
          </blockquote>

          ${lesson.memoryVerse.context ? `
            <div class="ss-verse-context">
              <strong>Context & Focus:</strong> ${escapeHtml(lesson.memoryVerse.context)}
            </div>
          ` : ""}

          ${lesson.goldenText ? `
            <div class="ss-golden-text">
              <span class="ss-golden-label">Golden Key Text</span>
              <p>${escapeHtml(lesson.goldenText)}</p>
            </div>
          ` : ""}
        </article>
      `;
    }

    // 2. Main Scripture Readings Section
    if (lesson.mainScriptures && lesson.mainScriptures.length > 0) {
      mainHtml += `
        <article id="ss-section-scriptures" class="ss-card ss-scriptures-card">
          <div class="ss-card-header">
            <span class="eyebrow" style="color:var(--red)">Word of Grace</span>
            <h2>Scripture Passages for Today</h2>
          </div>

          <div class="ss-scriptures-grid">
            ${lesson.mainScriptures.map((s, idx) => `
              <div class="ss-scripture-item">
                <div class="ss-scripture-top">
                  <span class="ss-scripture-tag">${escapeHtml(s.label || `Reading ${idx + 1}`)}</span>
                  <strong>${escapeHtml(s.reference)}</strong>
                </div>
                <p class="ss-scripture-snippet">“${escapeHtml(s.text)}”</p>
                <button type="button" class="ss-open-modal-btn" data-scripture-ref="${escapeHtml(s.reference)}" data-scripture-label="${escapeHtml(s.label || 'Passage')}" data-scripture-text="${escapeHtml(s.text)}">
                  📖 View Full Passage ↗
                </button>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }

    // 3. Objectives & Introduction Section
    mainHtml += `
      <article id="ss-section-objectives" class="ss-card ss-intro-card">
        <div class="ss-card-header">
          <span class="eyebrow">Foundation</span>
          <h2>Lesson Objectives & Introduction</h2>
        </div>

        ${lesson.objectives && lesson.objectives.length ? `
          <div class="ss-objectives-box">
            <h3>Lesson Objectives</h3>
            <ul class="ss-objectives-list">
              ${lesson.objectives.map(obj => `
                <li>
                  <span class="ss-check-icon">✓</span>
                  <span>${escapeHtml(obj)}</span>
                </li>
              `).join("")}
            </ul>
          </div>
        ` : ""}

        <div class="ss-intro-text">
          <h3>Introduction</h3>
          <p>${escapeHtml(lesson.introduction)}</p>
        </div>
      </article>
    `;

    // 4. Outlines Section
    if (lesson.outlines && lesson.outlines.length > 0) {
      mainHtml += `
        <section id="ss-section-outlines" class="ss-outlines-wrapper">
          <div class="ss-section-title">
            <span class="eyebrow" style="color:var(--yellow)">Deep Dive</span>
            <h2>Lesson Outlines & Exegesis</h2>
          </div>

          ${lesson.outlines.map(ot => `
            <article class="ss-card ss-outline-card">
              <div class="ss-outline-number">${escapeHtml(ot.number)}</div>
              <div class="ss-outline-body">
                <div class="ss-outline-head">
                  <h3>OUTLINE ${escapeHtml(ot.number)}: ${escapeHtml(ot.title)}</h3>
                  <span class="ss-outline-ref">📖 ${escapeHtml(ot.scripture)}</span>
                </div>
                <p class="ss-outline-summary"><strong>Summary:</strong> ${escapeHtml(ot.summary)}</p>

                <ul class="ss-outline-points">
                  ${ot.points.map(pt => {
        const formatted = escapeHtml(pt).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return `<li>${formatted}</li>`;
      }).join("")}
                </ul>

                ${ot.keyInsight ? `
                  <div class="ss-insight-box">
                    <strong>💡 Key Insight:</strong> ${escapeHtml(ot.keyInsight)}
                  </div>
                ` : ""}
              </div>
            </article>
          `).join("")}
        </section>
      `;
    }

    // 5. Class Discussion Questions Section
    if (lesson.discussionQuestions && lesson.discussionQuestions.length > 0) {
      mainHtml += `
        <article id="ss-section-discussion" class="ss-card ss-discussion-card">
          <div class="ss-card-header">
            <span class="eyebrow" style="color:var(--red)">Interactive Study</span>
            <h2>Class Discussion & Reflection</h2>
          </div>

          <div class="ss-questions-list">
            ${lesson.discussionQuestions.map((dq, idx) => `
              <div class="ss-question-item">
                <div class="ss-question-num">Question ${idx + 1}</div>
                <h4>${escapeHtml(dq.question)}</h4>
                ${dq.hint ? `<p class="ss-question-hint">💡 <em>Facilitator Hint: ${escapeHtml(dq.hint)}</em></p>` : ""}

                <div class="ss-user-note-area">
                  <label for="note-${dq.id}">Write your answer or thoughts:</label>
                  <textarea id="note-${dq.id}" class="ss-discussion-input" data-discussion-id="${dq.id}" placeholder="Type your personal thoughts or small group findings..."></textarea>
                  <div class="ss-note-saved-msg" data-note-msg="${dq.id}">Saved</div>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }

    // 6. Teacher's Corner (Teacher Mode Feature)
    if (lesson.teacherNotes) {
      mainHtml += `
        <article id="ss-section-teacher" class="ss-card ss-teacher-card ss-teacher-only">
          <div class="ss-card-header">
            <span class="eyebrow" style="color:var(--yellow)">Teacher & Leader Guide</span>
            <h2>Sunday School Facilitator's Corner</h2>
          </div>

          <div class="ss-teacher-grid">
            ${lesson.teacherNotes.facilitatorTips ? `
              <div class="ss-teacher-box">
                <h3>Teaching Tips & Pedagogy</h3>
                <ul>
                  ${lesson.teacherNotes.facilitatorTips.map(tip => `<li>• ${escapeHtml(tip)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}

            ${lesson.teacherNotes.prayerPoints ? `
              <div class="ss-teacher-box">
                <h3>Closing Prayer Focus</h3>
                <ul>
                  ${lesson.teacherNotes.prayerPoints.map(pp => `<li>🙏 ${escapeHtml(pp)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        </article>
      `;
    }

    // 7. Life Application Section
    if (lesson.lifeApplication) {
      mainHtml += `
        <article id="ss-section-application" class="ss-card ss-application-card">
          <div class="ss-card-header">
            <span class="eyebrow" style="color:var(--yellow)">Action Point</span>
            <h2>Weekly Faith Application</h2>
          </div>
          <div class="ss-app-content">
            <span class="ss-app-icon">🎯</span>
            <p>${escapeHtml(lesson.lifeApplication)}</p>
          </div>
        </article>
      `;
    }

    contentContainer.innerHTML = mainHtml;
  }

  // --- Interactive Features Setup ---

  // 1. Teacher Mode Toggle
  const teacherToggleBtn = document.querySelector("[data-ss-toggle-teacher]");
  if (teacherToggleBtn) {
    const isTeacher = localStorage.getItem("ss_teacher_mode") === "true";
    if (isTeacher) {
      document.body.classList.add("teacher-mode");
      teacherToggleBtn.setAttribute("aria-pressed", "true");
      teacherToggleBtn.classList.add("active");
    }

    teacherToggleBtn.addEventListener("click", () => {
      const active = document.body.classList.toggle("teacher-mode");
      teacherToggleBtn.setAttribute("aria-pressed", String(active));
      teacherToggleBtn.classList.toggle("active", active);
      localStorage.setItem("ss_teacher_mode", String(active));
    });
  }

  // 2. Memory Verse Recitation Drill Toggle
  const drillToggleBtn = document.querySelector("[data-ss-toggle-drill]");
  if (drillToggleBtn) {
    drillToggleBtn.addEventListener("click", () => {
      const fullText = document.querySelector("[data-ss-verse-full]");
      const hiddenText = document.querySelector("[data-ss-verse-hidden]");
      const btnText = drillToggleBtn.querySelector("[data-ss-drill-text]");

      if (fullText && hiddenText) {
        const isHidden = fullText.classList.toggle("hidden");
        hiddenText.classList.toggle("hidden", !isHidden);

        if (btnText) {
          btnText.textContent = isHidden ? "Show Full Verse" : "Practice Recitation (Hide Words)";
        }
      }
    });
  }

  // 3. Audio Text-to-Speech Player (Enhanced with Natural Voice Selection, Segmented Reading, & Active Card Highlighting)
  const audioPlayBtn = document.querySelector("[data-ss-audio-play]");
  const audioStopBtn = document.querySelector("[data-ss-audio-stop]");
  const audioStatus = document.querySelector("[data-ss-audio-status]");
  const audioBtnText = document.querySelector("[data-ss-audio-btn-text]");
  const audioIcon = document.querySelector(".ss-audio-icon");

  let isSpeaking = false;
  let isPaused = false;
  let currentSegmentIndex = 0;
  let segmentTimeout = null;
  let cachedVoice = null;

  // Smart natural voice selector: prefers Neural / Natural / Google / Premium online voices
  const getBestVoice = () => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;

    // 1. Natural / Neural / Online voices (Edge / Windows / Chrome)
    const natural = voices.find(v =>
      v.lang.startsWith("en") &&
      (v.name.includes("Natural") || v.name.includes("Online") || v.name.includes("Neural"))
    );
    if (natural) return natural;

    // 2. Google English voices
    const google = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google"));
    if (google) return google;

    // 3. Premium / Enhanced / Siri voices (Apple / iOS / macOS)
    const apple = voices.find(v =>
      v.lang.startsWith("en") &&
      (v.name.includes("Premium") || v.name.includes("Enhanced") || v.name.includes("Samantha"))
    );
    if (apple) return apple;

    // 4. Modern US/GB English
    const modernEn = voices.find(v => v.lang === "en-US" || v.lang === "en-GB");
    if (modernEn) return modernEn;

    // 5. Fallback English
    const fallbackEn = voices.find(v => v.lang.startsWith("en"));
    return fallbackEn || voices[0];
  };

  if ("speechSynthesis" in window) {
    cachedVoice = getBestVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoice = getBestVoice();
    };
  }

  // Build semantic segments for the current lesson with varied pacing, pitch, and target elements
  const buildSegments = () => {
    const segments = [];

    // 1. Lesson Title & Overview
    segments.push({
      label: "Lesson Title",
      text: `Sunday School Lesson ${lesson.lessonNumber}: ${lesson.topic}. ${lesson.subtitle || ''}`,
      rate: 0.95,
      pitch: 1.0,
      pause: 700,
      targetSelector: ".sunday-school-hero"
    });

    // 2. Memory Verse (Contemplative, slower, reverent tone)
    if (lesson.memoryVerse) {
      segments.push({
        label: "Memory Verse",
        text: `Golden Memory Verse, recited from ${lesson.memoryVerse.reference}. "${lesson.memoryVerse.text}"`,
        rate: 0.85,
        pitch: 0.96,
        pause: 900,
        targetSelector: "#ss-section-verse"
      });

      if (lesson.memoryVerse.context) {
        segments.push({
          label: "Verse Context",
          text: `Context and focus: ${lesson.memoryVerse.context}`,
          rate: 0.92,
          pitch: 1.0,
          pause: 650,
          targetSelector: "#ss-section-verse"
        });
      }
    }

    // 3. Golden Text
    if (lesson.goldenText) {
      segments.push({
        label: "Golden Key Text",
        text: `Golden Key Text: ${lesson.goldenText}`,
        rate: 0.88,
        pitch: 0.98,
        pause: 750,
        targetSelector: "#ss-section-verse"
      });
    }

    // 4. Scripture Readings
    if (lesson.mainScriptures && lesson.mainScriptures.length > 0) {
      lesson.mainScriptures.forEach((s, idx) => {
        segments.push({
          label: s.label || `Reading ${idx + 1}`,
          text: `${s.label || 'Scripture Reading'}, from ${s.reference}: "${s.text.replace(/\.\.\./g, '... ')}"`,
          rate: 0.88,
          pitch: 0.98,
          pause: 750,
          targetSelector: "#ss-section-scriptures"
        });
      });
    }

    // 5. Introduction & Objectives
    if (lesson.introduction) {
      segments.push({
        label: "Introduction",
        text: `Lesson Introduction: ${lesson.introduction}`,
        rate: 0.96,
        pitch: 1.0,
        pause: 750,
        targetSelector: "#ss-section-objectives"
      });
    }

    // 6. Outlines & Exegesis (each outline has distinct focus)
    if (lesson.outlines && lesson.outlines.length > 0) {
      lesson.outlines.forEach(ot => {
        const cleanPoints = (ot.points || []).map(p => p.replace(/\*\*/g, '')).join(". ");
        const outlineText = `Outline ${ot.number}: ${ot.title}. Scripture: ${ot.scripture}. Summary: ${ot.summary}. Key points: ${cleanPoints}. ${ot.keyInsight ? `Key Insight: ${ot.keyInsight}` : ''}`;
        segments.push({
          label: `Outline ${ot.number}`,
          text: outlineText,
          rate: 0.94,
          pitch: 1.0,
          pause: 800,
          targetSelector: "#ss-section-outlines"
        });
      });
    }

    // 7. Discussion Questions (Slight inflection for engagement)
    if (lesson.discussionQuestions && lesson.discussionQuestions.length > 0) {
      const qText = lesson.discussionQuestions.map((dq, idx) => `Question ${idx + 1}: ${dq.question}`).join(". ");
      segments.push({
        label: "Discussion Questions",
        text: `Class Discussion and Reflection. ${qText}`,
        rate: 0.92,
        pitch: 1.03,
        pause: 800,
        targetSelector: "#ss-section-discussion"
      });
    }

    // 8. Life Application
    if (lesson.lifeApplication) {
      segments.push({
        label: "Life Application",
        text: `Weekly Faith Application: ${lesson.lifeApplication}`,
        rate: 0.88,
        pitch: 0.97,
        pause: 900,
        targetSelector: "#ss-section-application"
      });
    }

    // 9. Closing Benediction
    segments.push({
      label: "Closing Benediction",
      text: `This concludes Sunday School Lesson ${lesson.lessonNumber}. May God richly bless the meditation of His word.`,
      rate: 0.88,
      pitch: 0.95,
      pause: 400,
      targetSelector: null
    });

    return segments;
  };

  const clearHighlight = () => {
    document.querySelectorAll(".ss-reading-active").forEach(el => el.classList.remove("ss-reading-active"));
  };

  const highlightCard = (targetSelector) => {
    clearHighlight();
    if (!targetSelector) return;
    const card = document.querySelector(targetSelector);
    if (card) {
      card.classList.add("ss-reading-active");

      // Auto-scroll gently into view if offscreen
      const rect = card.getBoundingClientRect();
      const toolbarOffset = 110;
      if (rect.top < toolbarOffset || rect.bottom > window.innerHeight) {
        const targetScroll = window.scrollY + rect.top - toolbarOffset;
        window.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
      }

      // Sync active state in TOC
      const targetId = card.getAttribute("id");
      if (targetId) {
        document.querySelectorAll(".ss-toc-link").forEach(link => {
          link.classList.toggle("active", link.getAttribute("href") === `#${targetId}`);
        });
      }
    }
  };

  const stopAudio = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    clearTimeout(segmentTimeout);
    isSpeaking = false;
    isPaused = false;
    currentSegmentIndex = 0;
    clearHighlight();

    if (audioStatus) audioStatus.textContent = "Ready to read aloud";
    if (audioBtnText) audioBtnText.textContent = "Listen";
    if (audioIcon) audioIcon.textContent = "▶";
    audioPlayBtn.classList.remove("playing");
    if (audioStopBtn) audioStopBtn.classList.add("hidden");
  };

  const playSegment = (segments, index) => {
    if (!isSpeaking || index >= segments.length) {
      stopAudio();
      if (audioStatus) audioStatus.textContent = "Finished reading";
      return;
    }

    currentSegmentIndex = index;
    const seg = segments[index];

    // Highlight card
    highlightCard(seg.targetSelector);

    // Update status bar
    if (audioStatus) audioStatus.textContent = `Reading: ${seg.label}...`;

    const utterance = new SpeechSynthesisUtterance(seg.text);
    utterance.voice = cachedVoice || getBestVoice();
    utterance.rate = seg.rate || 0.95;
    utterance.pitch = seg.pitch || 1.0;

    utterance.onend = () => {
      if (!isSpeaking) return;
      // Add conversational pause between sections
      segmentTimeout = setTimeout(() => {
        playSegment(segments, index + 1);
      }, seg.pause || 600);
    };

    utterance.onerror = (e) => {
      // If canceled purposefully, ignore
      if (e.error === "canceled" || e.error === "interrupted") return;
      console.warn("Speech synthesis segment error:", e);
      // Attempt to advance to next segment
      segmentTimeout = setTimeout(() => {
        playSegment(segments, index + 1);
      }, 400);
    };

    window.speechSynthesis.speak(utterance);
  };

  if (audioPlayBtn && "speechSynthesis" in window) {
    audioPlayBtn.addEventListener("click", () => {
      const segments = buildSegments();

      if (isSpeaking && !isPaused) {
        // Pause
        window.speechSynthesis.cancel();
        clearTimeout(segmentTimeout);
        isPaused = true;
        isSpeaking = false;
        if (audioStatus) audioStatus.textContent = `Paused: ${segments[currentSegmentIndex]?.label || 'lesson'}`;
        if (audioBtnText) audioBtnText.textContent = "Resume";
        if (audioIcon) audioIcon.textContent = "▶";
        audioPlayBtn.classList.remove("playing");
      } else {
        // Play or Resume
        window.speechSynthesis.cancel();
        clearTimeout(segmentTimeout);
        isSpeaking = true;
        isPaused = false;

        if (audioBtnText) audioBtnText.textContent = "Pause";
        if (audioIcon) audioIcon.textContent = "⏸";
        audioPlayBtn.classList.add("playing");
        if (audioStopBtn) audioStopBtn.classList.remove("hidden");

        playSegment(segments, currentSegmentIndex);
      }
    });

    if (audioStopBtn) {
      audioStopBtn.addEventListener("click", () => {
        stopAudio();
      });
    }

    // Cancel speech when navigating away
    window.addEventListener("beforeunload", () => {
      window.speechSynthesis.cancel();
    });
  } else if (audioPlayBtn) {
    if (audioStatus) audioStatus.textContent = "Audio reader unsupported";
  }

  // 4. Font Size Adjuster
  let currentFontSize = parseFloat(localStorage.getItem("ss_font_scale") || "1.0");
  const updateFontScale = (scale) => {
    currentFontSize = Math.max(0.85, Math.min(1.35, scale));
    document.documentElement.style.setProperty("--ss-font-scale", currentFontSize);
    localStorage.setItem("ss_font_scale", currentFontSize.toString());
  };
  updateFontScale(currentFontSize);

  document.querySelector("[data-ss-font-increase]")?.addEventListener("click", () => updateFontScale(currentFontSize + 0.1));
  document.querySelector("[data-ss-font-decrease]")?.addEventListener("click", () => updateFontScale(currentFontSize - 0.1));

  // 5. Print Button
  document.querySelector("[data-ss-print]")?.addEventListener("click", () => window.print());

  // 6. Scripture Popover Modal
  const modal = document.querySelector("[data-ss-scripture-modal]");
  const modalTitle = document.querySelector("[data-ss-modal-title]");
  const modalBody = document.querySelector("[data-ss-modal-body]");
  const modalClose = document.querySelector("[data-ss-modal-close]");

  document.querySelectorAll("[data-scripture-ref]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ref = btn.getAttribute("data-scripture-ref");
      const label = btn.getAttribute("data-scripture-label");
      const text = btn.getAttribute("data-scripture-text");

      if (modalTitle) modalTitle.textContent = `${label} — ${ref}`;
      if (modalBody) modalBody.innerHTML = `<p style="font-size:1.2rem; line-height:1.8; color:var(--navy);">“${escapeHtml(text)}”</p>`;
      if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
      }
    });
  });

  const closeModal = () => {
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  };

  modalClose?.addEventListener("click", closeModal);
  modal?.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  // 7. Discussion Questions Local Storage Persistence
  document.querySelectorAll("[data-discussion-id]").forEach(input => {
    const qId = input.getAttribute("data-discussion-id");
    const storageKey = `ss_note_${lesson.id}_${qId}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) input.value = saved;

    input.addEventListener("input", () => {
      localStorage.setItem(storageKey, input.value);
      const msg = document.querySelector(`[data-note-msg="${qId}"]`);
      if (msg) {
        msg.classList.add("visible");
        setTimeout(() => msg.classList.remove("visible"), 2000);
      }
    });
  });

  // 8. Side Rail Quick Notes Persistence
  const quickNotesInput = document.querySelector("[data-ss-quick-notes]");
  const quickNotesStatus = document.querySelector("[data-ss-notes-status]");

  if (quickNotesInput) {
    const notesKey = `ss_quick_notes_${lesson.id}`;
    quickNotesInput.value = localStorage.getItem(notesKey) || "";

    quickNotesInput.addEventListener("input", () => {
      localStorage.setItem(notesKey, quickNotesInput.value);
      if (quickNotesStatus) {
        quickNotesStatus.textContent = "Saved";
        setTimeout(() => { quickNotesStatus.textContent = "Saved locally"; }, 2000);
      }
    });
  }

  // 9. Reading Progress Bar & Scrollspy TOC
  const progressBar = document.querySelector("[data-ss-progress-bar]");
  const tocLinks = document.querySelectorAll(".ss-toc-link");

  const onScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    // Scrollspy highlight
    const sections = document.querySelectorAll("[id^='ss-section-']");
    let currentId = "";

    sections.forEach(sec => {
      const top = sec.offsetTop - 180;
      if (scrollTop >= top) {
        currentId = sec.getAttribute("id");
      }
    });

    if (currentId) {
      tocLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === `#${currentId}`);
      });
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
}

function setupNavigation() {
  const button = document.querySelector(".menu-btn");
  const navigation = document.querySelector(".nav-links");

  if (button && navigation) {
    button.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  }

  document.querySelectorAll(".nav-submenu-toggle").forEach(toggle => {
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const dropdown = toggle.closest(".nav-dropdown");
      const isOpen = dropdown?.classList.toggle("submenu-open") || false;
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  });

  const current = window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");

      const dropdown = link.closest(".nav-dropdown");
      dropdown?.querySelector(".nav-dropdown-trigger > a")?.classList.add("active");
    }

    link.addEventListener("click", () => {
      navigation?.classList.remove("open");
      button?.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".nav-dropdown")) {
      document.querySelectorAll(".nav-dropdown.submenu-open").forEach(dropdown => {
        dropdown.classList.remove("submenu-open");
        dropdown.querySelector(".nav-submenu-toggle")?.setAttribute("aria-expanded", "false");
      });
    }
  });
}

async function loadLocalContent() {
  const response = await fetch(CONTENT_PATH, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Content request failed with status ${response.status}.`);
  }

  return response.json();
}

async function loadMergedContent(page) {
  // Supabase is the live source of truth.
  // ContentService itself falls back to site-content.json only when the live
  // page sections cannot be loaded.
  if (typeof ContentService !== "undefined") {
    return ContentService.getPageContent(page);
  }

  // If ContentService itself is unavailable, use the repository JSON as the
  // emergency fallback so the public site can still render.
  return {
    ...(await loadLocalContent()),
    _source: "local_json_fallback"
  };
}

function setupLazyContentObservers() {
  if (typeof IntersectionObserver === "undefined") return;

  const lazyObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;

        // Lazy load images with data-src
        if (el.dataset.src) {
          el.src = el.dataset.src;
          el.removeAttribute("data-src");
        }

        // Lazy load background images with data-bg
        if (el.dataset.bg) {
          el.style.backgroundImage = `url('${el.dataset.bg}')`;
          el.removeAttribute("data-bg");
        }

        el.classList.add("lazy-loaded");
        observer.unobserve(el);
      }
    });
  }, {
    rootMargin: "200px 0px", // Trigger 200px before element enters viewport
    threshold: 0.01
  });

  document.querySelectorAll("img[loading='lazy'], [data-src], [data-bg], .card").forEach(el => {
    lazyObserver.observe(el);
  });
}

async function initialiseSite() {
  try {
    const page = document.body.dataset.page;
    const content = await loadMergedContent(page);

    renderShared(content);
    console.log(`[SiteInit] Loaded page '${page}' content (source: ${content._source || "local"}).`);

    const renderers = {
      home: renderHome,
      about: renderAbout,
      ministries: renderMinistries,
      ministryDetail: renderMinistryDetail,
      chapelDetail: renderMinistryDetail,
      houseFellowships: renderHouseFellowships,
      chapels: renderChapels,
      sermons: renderSermons,
      live: renderLive,
      publications: renderPublications,
      publicationPost: renderPublicationPost,
      publicationDetail: renderPublicationDetail,
      sundaySchoolDetail: renderSundaySchoolDetail,
      quickLinks: renderQuickLinks,
      events: renderEvents,
      give: renderGive,
      bibleCollege: renderBibleCollege
    };

    renderers[page]?.(content);
    setupNavigation();
    setupLazyContentObservers();
    document.body.dataset.contentLoading = "false";
  } catch (error) {
    console.error(error);
    document.body.dataset.contentLoading = "false";

    const main = document.querySelector("main");
    if (main) {
      const message = window.location.protocol === "file:"
        ? "The website content could not be loaded. Open this site through a local or online web server instead of double-clicking the HTML file."
        : "Some website content could not be loaded completely. Please refresh the page. If the problem continues, contact the site administrator.";

      main.insertAdjacentHTML(
        "afterbegin",
        `<div class="container"><p class="content-error">${message}</p></div>`
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", initialiseSite);
