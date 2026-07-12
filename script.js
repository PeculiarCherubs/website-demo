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
  element.textContent = item.label || item.text || "";
  element.href = item.href || "#";
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
      const className = item.className ? ` class="${escapeHtml(item.className)}"` : "";
      return `<a${className} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;
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

function renderHome(content) {
  const home = content.home;

  renderHeroSlides(home.hero.slides);
  setText("[data-home-hero-badge]", home.hero.badge);
  setText("[data-home-hero-title]", home.hero.title);
  setText("[data-home-hero-highlight]", home.hero.highlight);
  setText("[data-home-hero-description]", home.hero.description);
  setLink("[data-home-primary-button]", home.hero.primaryButton);
  setLink("[data-home-secondary-button]", home.hero.secondaryButton);
  setText("[data-home-scroll-text]", home.hero.scrollText);

  setText("[data-home-identity-eyebrow]", home.identity.eyebrow);
  setText("[data-home-identity-title]", home.identity.title);
  setText("[data-home-identity-description]", home.identity.description);

  const identityCards = document.querySelector("[data-home-identity-cards]");
  if (identityCards) {
    identityCards.innerHTML = home.identity.cards.map(card => `
      <article class="card">
        <div class="icon">${escapeHtml(card.icon)}</div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
      </article>
    `).join("");
  }

  const chapelList = document.querySelector("[data-home-chapels]");
  if (chapelList) {
    chapelList.innerHTML = content.chapels.current.slice(0, 3).map(chapel => `
      <article class="card campus-card">
        <div class="campus-logo-wrap">
          <img class="campus-logo" src="${escapeHtml(chapel.logo)}" alt="${escapeHtml(chapel.name)} logo">
        </div>
        <div class="campus-body">
          <div class="meta">${escapeHtml(chapel.status)}</div>
          <h3>${escapeHtml(chapel.name)}</h3>
          <p>${escapeHtml(chapel.subtitle)}</p>
        </div>
      </article>
    `).join("");
  }

  setText("[data-pastor-eyebrow]", home.pastor.eyebrow);
  setText("[data-pastor-title]", home.pastor.title);
  setText("[data-pastor-text]", home.pastor.text);
  setText("[data-pastor-name]", home.pastor.name);
  setText("[data-pastor-role]", home.pastor.role);

  const pastorLink = document.querySelector("[data-pastor-link]");
  if (pastorLink) {
    pastorLink.textContent = `${home.pastor.linkLabel} ↗`;
    pastorLink.href = home.pastor.linkHref;
  }

  const pastorPhoto = document.querySelector("[data-pastor-photo]");
  if (pastorPhoto && home.pastor.image) {
    pastorPhoto.style.backgroundImage = `url("${home.pastor.image}")`;
    pastorPhoto.style.backgroundSize = "cover";
    pastorPhoto.style.backgroundPosition = "center";
    pastorPhoto.innerHTML = "";
  }

  const homeSermons = document.querySelector("[data-home-sermons]");
  if (homeSermons) {
    homeSermons.innerHTML = content.sermons.items.slice(0, 3).map(sermon => sermonCard(sermon)).join("");
  }

  setText("[data-testimonials-eyebrow]", home.testimonials.eyebrow);
  setText("[data-testimonials-title]", home.testimonials.title);
  setText("[data-testimonials-description]", home.testimonials.description);

  const testimonialList = document.querySelector("[data-testimonials-list]");
  if (testimonialList) {
    testimonialList.innerHTML = home.testimonials.items.map(item => `
      <article class="testimonial-card${item.featured ? " featured-testimonial" : ""}">
        <div class="testimonial-mark">“</div>
        <p>${escapeHtml(item.quote)}</p>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.chapel)}</span>
      </article>
    `).join("");
  }

  const quickLinks = document.querySelector("[data-home-quick-links]");
  if (quickLinks) {
    quickLinks.innerHTML = content.quickLinks.links.slice(2, 5).map(link => quickLinkCard(link)).join("");
  }
  
  const themes = content.home.themes;

  setText("[data-year-theme-label]", themes.year.label);
  setText("[data-year-theme-title]", themes.year.title);
  setText("[data-year-theme-scripture]", themes.year.scripture);

  setText("[data-month-theme-label]", themes.month.label);
  setText("[data-month-theme-title]", themes.month.title);
  setText("[data-month-theme-scripture]", themes.month.scripture);
}

function sermonCard(sermon) {
  return `
    <article class="card sermon-card">
      <div class="sermon-thumb" style="background-image:url('${escapeHtml(sermon.image)}')">
        <span class="play">▶</span>
      </div>
      <div class="sermon-body">
        <div class="meta">${escapeHtml(sermon.category)}</div>
        <h3>${escapeHtml(sermon.title)}</h3>
        <p>${escapeHtml(sermon.speaker)} · ${escapeHtml(sermon.duration)}</p>
      </div>
    </article>
  `;
}

function quickLinkCard(link) {
  return `
    <a class="quick-link" href="${escapeHtml(link.href)}">
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
  setText("[data-about-story-quote]", `“${content.about.story.quote}”`);

  const paragraphs = document.querySelector("[data-about-story-paragraphs]");
  if (paragraphs) {
    paragraphs.innerHTML = content.about.story.paragraphs
      .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
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
}

function renderChapels(content) {
  renderStandardHero(content.chapels);

  const current = document.querySelector("[data-current-chapels]");
  if (current) {
    current.innerHTML = content.chapels.current.map(chapel => `
      <article class="card campus-card">
        <div class="campus-logo-wrap">
          <img class="campus-logo" src="${escapeHtml(chapel.logo)}" alt="${escapeHtml(chapel.name)} logo">
        </div>
        <div class="campus-body">
          <div class="meta">${escapeHtml(chapel.status)}</div>
          <h3>${escapeHtml(chapel.name)}</h3>
          <p>${escapeHtml(chapel.subtitle)}</p>
        </div>
      </article>
    `).join("");
  }

  const upcoming = document.querySelector("[data-upcoming-chapels]");
  if (upcoming) {
    upcoming.innerHTML = content.chapels.upcoming.map(chapel => `
      <article class="card campus-card upcoming-card">
        <div class="campus-logo-wrap">
          <img class="campus-logo" src="${escapeHtml(chapel.logo)}" alt="${escapeHtml(chapel.name)} placeholder logo">
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
  const list = document.querySelector("[data-sermons-list]");
  if (list) {
    list.innerHTML = content.sermons.items.map(sermon => sermonCard(sermon)).join("");
  }
}



function renderPublications(content) {
  renderStandardHero(content.publications);

  const daily = content.publications.dailyDevotion;
  setText("[data-daily-devotion-type]", daily.type);
  setText("[data-daily-devotion-title]", daily.title);
  setText("[data-daily-devotion-text]", daily.text);
  setLink("[data-daily-devotion-button]", {
    label: daily.button,
    href: daily.href
  });

  const latest = content.publications.latestGoodnews;
  setText("[data-latest-goodnews-eyebrow]", latest.eyebrow);
  setText("[data-latest-goodnews-heading]", latest.heading);
  setText("[data-latest-goodnews-supporting]", latest.supportingText);
  setText("[data-latest-goodnews-cover-top]", latest.coverTop);
  setMultilineText("[data-latest-goodnews-cover-title]", latest.coverTitle);
  setText("[data-latest-goodnews-cover-bottom]", latest.coverBottom);
  setText("[data-latest-goodnews-label]", latest.label);
  setText("[data-latest-goodnews-title]", latest.title);
  setText("[data-latest-goodnews-text]", latest.text);
  setLink("[data-latest-goodnews-button]", {
    label: latest.button,
    href: latest.href
  });

  const archive = document.querySelector("[data-publication-archive]");
  if (archive) {
    archive.innerHTML = content.publications.archive.map(item => `
      <article class="publication-issue-card publication-theme-${escapeHtml(item.theme)}">
        <div class="publication-issue-cover">
          <span class="publication-type">${escapeHtml(item.type)}</span>
          <strong>${escapeHtml(item.issue)}</strong>
          <small>Weekly Publication</small>
        </div>
        <div class="publication-issue-body">
          <div class="meta">${escapeHtml(item.status)}</div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.text)}</p>
          <a class="text-link publication-read-link" href="${escapeHtml(item.href)}">Read edition ↗</a>
        </div>
      </article>
    `).join("");
  }

  const school = content.publications.sundaySchool;
  setText("[data-sunday-school-type]", school.type);
  setText("[data-sunday-school-title]", school.title);
  setText("[data-sunday-school-text]", school.text);
  setLink("[data-sunday-school-button]", {
    label: school.button,
    href: school.href
  });
}

function renderQuickLinks(content) {
  renderStandardHero(content.quickLinks);

  const links = document.querySelector("[data-quick-links]");
  if (links) {
    links.innerHTML = content.quickLinks.links.map(link => quickLinkCard(link)).join("");
  }

  const events = document.querySelector("[data-events-list]");
  if (events) {
    events.innerHTML = content.quickLinks.events.map(event => `
      <article class="card">
        <div class="meta">${escapeHtml(event.frequency)}</div>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.text)}</p>
      </article>
    `).join("");
  }
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
    courses.innerHTML = school.courses.map(course => `
      <article class="card bible-course-card">
        <div class="meta">${escapeHtml(course.code)}</div>
        <h3>${escapeHtml(course.title)}</h3>
        <p>${escapeHtml(course.text)}</p>
        <a class="text-link" href="#">Course details ↗</a>
      </article>
    `).join("");
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
  setLink("[data-bible-registration-button]", {
    label: school.registration.button,
    href: school.registration.href
  });

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
    buttons.innerHTML = school.portal.buttons.map((button, index) => `
      <a class="btn ${index === 0 ? "btn-primary" : "btn-secondary"}"
         href="${escapeHtml(button.href)}">
        ${escapeHtml(button.label)}
      </a>
    `).join("");
  }
}

function renderGive(content) {
  renderStandardHero(content.give);
  setText("[data-give-why-eyebrow]", content.give.why.eyebrow);
  setText("[data-give-why-title]", content.give.why.title);
  setText("[data-give-why-description]", content.give.why.description);
  setText("[data-give-why-quote]", `“${content.give.why.quote}”`);

  const options = document.querySelector("[data-give-options]");
  if (options) {
    options.innerHTML = content.give.options.map(option => `
      <a class="give-option" href="${escapeHtml(option.href)}">
        <span>${escapeHtml(option.label)}</span>
        <b>↗</b>
      </a>
    `).join("");
  }
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

  const current = window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", () => {
      navigation?.classList.remove("open");
      button?.setAttribute("aria-expanded", "false");
    });
  });
}

async function initialiseSite() {
  try {
    const response = await fetch(CONTENT_PATH, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Content request failed with status ${response.status}.`);
    }

    const content = await response.json();
    renderShared(content);

    const page = document.body.dataset.page;
    const renderers = {
      home: renderHome,
      about: renderAbout,
      chapels: renderChapels,
      sermons: renderSermons,
      publications: renderPublications,
      quickLinks: renderQuickLinks,
      give: renderGive,
      bibleCollege: renderBibleCollege
    };

    renderers[page]?.(content);
    setupNavigation();
    document.body.dataset.contentLoading = "false";
  } catch (error) {
    console.error(error);
    document.body.dataset.contentLoading = "false";

    const main = document.querySelector("main");
    if (main) {
      main.insertAdjacentHTML(
        "afterbegin",
        `<div class="container"><p class="content-error">The website content could not be loaded. Open this site through a local or online web server instead of double-clicking the HTML file.</p></div>`
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", initialiseSite);
