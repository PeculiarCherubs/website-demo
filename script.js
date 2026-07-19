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
      const classNames = [item.className].filter(Boolean).join(" ");
      const className = classNames ? ` class="${escapeHtml(classNames)}"` : "";

      if (!item.children?.length) {
        return `<a${className} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;
      }

      const children = item.children.map(child => `
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

function renderHome(content) {
  const home = content.home;

  if (home.themes) {
    setText("[data-year-theme-label]", home.themes.year?.label);
    setText("[data-year-theme-title]", home.themes.year?.title);
    setText("[data-year-theme-scripture]", home.themes.year?.scripture);

    setText("[data-month-theme-label]", home.themes.month?.label);
    setText("[data-month-theme-title]", home.themes.month?.title);
    setText("[data-month-theme-scripture]", home.themes.month?.scripture);
  }

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

  const homeMinistries = document.querySelector("[data-home-ministries]");
  if (homeMinistries) {
    homeMinistries.innerHTML = content.ministries.homeFeatured
      .map(key => content.ministries.details[key])
      .filter(Boolean)
      .map(item => ministryCard(item))
      .join("");
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

  const featured = posts.find(post => post.featured) || posts[0];
  const featuredContainer = document.querySelector("[data-publication-featured]");
  if (featuredContainer && featured) {
    featuredContainer.innerHTML = `
      ${publicationCover(featured, "publication-featured-cover")}
      <div class="publication-featured-copy">
        <div class="meta">${escapeHtml(featured.type)} · ${escapeHtml(publicationDate(featured.date))}</div>
        <h3>${escapeHtml(featured.title)}</h3>
        <p>${escapeHtml(featured.excerpt)}</p>
        <div class="publication-card-tags">
          ${(featured.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
        <a class="btn btn-primary" href="${publicationPostUrl(featured)}">Read Featured Publication</a>
      </div>
    `;
  }

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
  const key = document.body.dataset.ministryKey;
  const item = content.ministries.details[key];

  if (!item) {
    throw new Error(`Unknown ministry key: ${key}`);
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
      ministries: renderMinistries,
      ministryDetail: renderMinistryDetail,
      houseFellowships: renderHouseFellowships,
      chapels: renderChapels,
      sermons: renderSermons,
      publications: renderPublications,
      publicationPost: renderPublicationPost,
      quickLinks: renderQuickLinks,
      events: renderEvents,
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
