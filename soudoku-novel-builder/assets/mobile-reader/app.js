const novel = document.getElementById("novel");
const progressBar = document.getElementById("progressBar");
const deviceScroll = document.getElementById("deviceScroll");
const menuToggle = document.getElementById("menuToggle");
const menuBackdrop = document.getElementById("menuBackdrop");
const chapterMenu = document.getElementById("chapterMenu");
const chapterMenuList = document.getElementById("chapterMenuList");
const deviceShell = document.querySelector(".device-shell");

const story = window.STORY_DATA;
const storagePrefix = `reader:${story.slug || "web-novel"}`;

let chapterAnchors = [];
let talkAnchors = [];
let chapterLinkElements = [];
let currentChapterId = null;
let currentTalkId = null;
let ticking = false;
let restoreQueued = false;
let persistTimer = null;
let bookmarks = readStoredJson(`${storagePrefix}:bookmarks`, []);

const bookmarkButton = document.createElement("button");
bookmarkButton.className = "bookmark-toggle";
bookmarkButton.type = "button";
bookmarkButton.setAttribute("aria-label", "現在位置に栞を挟む");
bookmarkButton.innerHTML = `
  <svg class="bookmark-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.75h10a1.25 1.25 0 0 1 1.25 1.25v15.6a.4.4 0 0 1-.66.31L12 16.1l-5.59 4.81a.4.4 0 0 1-.66-.31V5A1.25 1.25 0 0 1 7 3.75Z" />
  </svg>
`;
deviceShell?.append(bookmarkButton);

function readStoredJson(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore localStorage failures so the reader still works in private mode.
  }
}

function paragraphElement(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "talk-paragraph";
  paragraph.textContent = text;
  return paragraph;
}

function titlePage(storyData) {
  const section = document.createElement("section");
  section.className = "title-page";

  const card = document.createElement("div");
  card.className = "title-page-card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "title-page-eyebrow";
  eyebrow.textContent = "Mobile Web Novel";

  const heading = document.createElement("h1");
  heading.className = "title-page-title";

  if (Array.isArray(storyData.titleDisplayLines) && storyData.titleDisplayLines.length > 0) {
    const subtitleStartIndex = storyData.subtitle ? storyData.titleDisplayLines.findIndex((line, index) => index > 0 && line) : -1;
    storyData.titleDisplayLines.forEach((line, index) => {
      const span = document.createElement("span");
      span.className = line ? "title-page-title-line" : "title-page-title-spacer";
      if (line) {
        span.dataset.lineIndex = String(index);
        if (line.length > 18) {
          span.classList.add("is-long");
        }
        if (subtitleStartIndex !== -1 && index >= subtitleStartIndex) {
          span.classList.add("is-subtitle");
        }
      }
      span.textContent = line || " ";
      heading.append(span);
    });
  } else {
    heading.textContent = storyData.title;
  }

  const summary = document.createElement("p");
  summary.className = "title-page-meta";
  summary.textContent = `${storyData.chapterCount}章 / ${storyData.talkCount}話収録`;

  if (storyData.titleImage) {
    const artWrap = document.createElement("div");
    artWrap.className = "title-page-art";

    const art = document.createElement("img");
    art.className = "title-page-image";
    art.src = storyData.titleImage;
    art.alt = storyData.titleImageAlt || storyData.title;
    art.loading = "eager";
    art.decoding = "async";

    const overlay = document.createElement("div");
    overlay.className = "title-page-overlay";
    overlay.append(eyebrow, heading);

    artWrap.append(art, overlay);
    card.append(artWrap, summary);
  } else {
    card.append(eyebrow, heading, summary);
  }

  section.append(card);
  return section;
}

function chapterHero(chapter) {
  const hero = document.createElement("div");
  hero.className = "chapter-hero";

  const image = document.createElement("img");
  image.className = "chapter-hero-image";
  image.src = chapter.coverImage;
  image.alt = chapter.coverAlt || chapter.title;
  image.loading = "lazy";
  image.decoding = "async";

  const veil = document.createElement("div");
  veil.className = "chapter-hero-veil";

  const meta = document.createElement("div");
  meta.className = "chapter-hero-meta";

  const label = document.createElement("p");
  label.className = "chapter-hero-label";
  label.textContent = chapter.label;

  const title = document.createElement("h2");
  title.className = "chapter-hero-title";
  title.textContent = chapter.displayTitle || chapter.title;

  meta.append(label, title);
  hero.append(image, veil, meta);
  return hero;
}

function talkCard(talk) {
  const article = document.createElement("article");
  article.className = "talk-card";
  article.id = talk.id;

  const header = document.createElement("header");
  header.className = "talk-header";

  const label = document.createElement("p");
  label.className = "talk-label";
  label.textContent = talk.label;

  const title = document.createElement("h3");
  title.className = "talk-title";
  title.textContent = talk.displayTitle || talk.title;

  const body = document.createElement("div");
  body.className = "talk-body";
  body.append(...talk.paragraphs.map((paragraph) => paragraphElement(paragraph)));

  header.append(label, title);
  article.append(header, body);
  return article;
}

function chapterSection(chapter) {
  const section = document.createElement("section");
  section.className = "chapter-section";
  section.id = chapter.id;
  section.dataset.chapterId = chapter.id;
  section.dataset.mood = chapter.mood;

  const talksWrap = document.createElement("div");
  talksWrap.className = "talk-list";
  talksWrap.append(...chapter.talks.map((talk) => talkCard(talk)));

  section.append(chapterHero(chapter), talksWrap);
  return section;
}

function chapterMenuGroup(chapter) {
  const section = document.createElement("section");
  section.className = "chapter-menu-group";

  const button = document.createElement("button");
  button.className = "chapter-link";
  button.type = "button";
  button.dataset.chapterId = chapter.id;
  button.innerHTML = `
    <span class="chapter-link-index">${chapter.label}</span>
    <span class="chapter-link-title">${chapter.displayTitle || chapter.title}</span>
  `;
  button.addEventListener("click", () => {
    const anchor = document.getElementById(chapter.id);
    if (anchor) {
      deviceScroll.scrollTo({
        top: Math.max(0, anchor.offsetTop - 16),
        behavior: "smooth",
      });
    }
    setMenuOpen(false);
  });

  const talks = document.createElement("div");
  talks.className = "chapter-menu-talks";
  talks.append(
    ...chapter.talks.map((talk) => {
      const talkButton = document.createElement("button");
      talkButton.className = "chapter-talk-link";
      talkButton.type = "button";
      talkButton.textContent = `${talk.label} ${talk.displayTitle || talk.title}`;
      talkButton.addEventListener("click", () => {
        const anchor = document.getElementById(talk.id);
        if (anchor) {
          deviceScroll.scrollTo({
            top: Math.max(0, anchor.offsetTop - 12),
            behavior: "smooth",
          });
        }
        setMenuOpen(false);
      });
      return talkButton;
    }),
  );

  section.append(button, talks);
  return { section, button };
}

function setMenuOpen(isOpen) {
  document.body.classList.toggle("menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "章メニューを閉じる" : "章メニューを開く");
  chapterMenu.setAttribute("aria-hidden", String(!isOpen));
  menuBackdrop.hidden = !isOpen;
}

function cacheLayout() {
  chapterAnchors = [...document.querySelectorAll(".chapter-section")].map((element) => ({
    id: element.dataset.chapterId,
    mood: element.dataset.mood || "sunrise",
    top: element.offsetTop,
  }));
  talkAnchors = [...document.querySelectorAll(".talk-card")].map((element) => {
    const chapterSection = element.closest(".chapter-section");
    return {
      id: element.id,
      chapterId: chapterSection?.dataset.chapterId || "",
      top: element.offsetTop,
      title: element.querySelector(".talk-title")?.textContent || "",
      label: element.querySelector(".talk-label")?.textContent || "",
    };
  });
}

function updateActiveChapter() {
  if (chapterAnchors.length === 0) {
    return;
  }

  const anchorLine = deviceScroll.scrollTop + deviceScroll.clientHeight * 0.22;
  let active = chapterAnchors[0];

  chapterAnchors.forEach((entry) => {
    if (entry.top <= anchorLine) {
      active = entry;
    }
  });

  if (!active || active.id === currentChapterId) {
    return;
  }

  currentChapterId = active.id;
  document.body.dataset.mood = active.mood;
  chapterLinkElements.forEach((element) => {
    element.classList.toggle("is-current", element.dataset.chapterId === currentChapterId);
  });
}

function updateActiveTalk() {
  if (talkAnchors.length === 0) {
    return;
  }

  const anchorLine = deviceScroll.scrollTop + deviceScroll.clientHeight * 0.22;
  let active = talkAnchors[0];

  talkAnchors.forEach((entry) => {
    if (entry.top <= anchorLine) {
      active = entry;
    }
  });

  currentTalkId = active?.id || null;
  syncBookmarkButtonState();
}

function updateProgress() {
  const maxScroll = deviceScroll.scrollHeight - deviceScroll.clientHeight;
  const ratio = maxScroll <= 0 ? 0 : deviceScroll.scrollTop / maxScroll;
  progressBar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  updateActiveChapter();
  updateActiveTalk();
}

function onScroll() {
  if (ticking) {
    return;
  }

  ticking = true;
  window.requestAnimationFrame(() => {
    updateProgress();
    schedulePersistLastRead();
    ticking = false;
  });
}

function currentReadingPosition() {
  const activeTalk =
    talkAnchors.find((entry) => entry.id === currentTalkId) ||
    talkAnchors.find((entry) => entry.chapterId === currentChapterId) ||
    null;

  return {
    chapterId: currentChapterId,
    talkId: activeTalk?.id || null,
    label: activeTalk ? `${activeTalk.label} ${activeTalk.title}`.trim() : currentChapterId || "",
    scrollTop: deviceScroll.scrollTop,
    savedAt: new Date().toISOString(),
  };
}

function schedulePersistLastRead() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    writeStoredJson(`${storagePrefix}:last-read`, currentReadingPosition());
  }, 160);
}

function jumpToReadingTarget(position, smooth = true) {
  if (!position) {
    return;
  }

  const target =
    (position.talkId && document.getElementById(position.talkId)) ||
    (position.chapterId && document.getElementById(position.chapterId));

  if (target) {
    deviceScroll.scrollTo({
      top: Math.max(0, target.offsetTop - 12),
      behavior: smooth ? "smooth" : "auto",
    });
    return;
  }

  if (Number.isFinite(position.scrollTop)) {
    deviceScroll.scrollTo({
      top: Math.max(0, position.scrollTop),
      behavior: smooth ? "smooth" : "auto",
    });
  }
}

function restoreLastRead() {
  if (restoreQueued) {
    return;
  }

  const saved = readStoredJson(`${storagePrefix}:last-read`, null);
  if (!saved) {
    return;
  }

  restoreQueued = true;
  window.requestAnimationFrame(() => {
    jumpToReadingTarget(saved, false);
    updateProgress();
    restoreQueued = false;
  });
}

function bookmarkKey(position) {
  return position.talkId || position.chapterId || "";
}

function syncBookmarkButtonState() {
  const key = bookmarkKey(currentReadingPosition());
  const isBookmarked = bookmarks.some((entry) => bookmarkKey(entry) === key);
  bookmarkButton.classList.toggle("is-active", isBookmarked);
  bookmarkButton.setAttribute("aria-label", isBookmarked ? "現在位置の栞を外す" : "現在位置に栞を挟む");
}

function renderBookmarkSection() {
  const section = document.createElement("section");
  section.className = "bookmark-section";

  const heading = document.createElement("p");
  heading.className = "bookmark-section-title";
  heading.textContent = "栞";
  section.append(heading);

  if (bookmarks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "bookmark-empty";
    empty.textContent = "まだ栞はありません";
    section.append(empty);
    return section;
  }

  const list = document.createElement("div");
  list.className = "bookmark-list";
  bookmarks.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "bookmark-link";
    button.type = "button";
    button.textContent = entry.label || entry.chapterId || "栞";
    button.addEventListener("click", () => {
      jumpToReadingTarget(entry, true);
      setMenuOpen(false);
    });
    list.append(button);
  });
  section.append(list);
  return section;
}

function toggleCurrentBookmark() {
  const position = currentReadingPosition();
  const key = bookmarkKey(position);
  if (!key) {
    return;
  }

  const exists = bookmarks.some((entry) => bookmarkKey(entry) === key);
  bookmarks = exists
    ? bookmarks.filter((entry) => bookmarkKey(entry) !== key)
    : [position, ...bookmarks.filter((entry) => bookmarkKey(entry) !== key)].slice(0, 12);
  writeStoredJson(`${storagePrefix}:bookmarks`, bookmarks);
  renderMenu();
  syncBookmarkButtonState();
}

function renderMenu() {
  const bookmarkSection = renderBookmarkSection();
  const menuSections = story.chapters.map((chapter) => chapterMenuGroup(chapter));
  chapterLinkElements = menuSections.map((entry) => entry.button);
  chapterMenuList.replaceChildren(bookmarkSection, ...menuSections.map((entry) => entry.section));
}

function render(storyData) {
  if (!storyData || !Array.isArray(storyData.chapters) || storyData.chapters.length === 0) {
    novel.innerHTML = '<div class="loading-state">表示できる本文がありません。</div>';
    return;
  }

  document.title = storyData.title;
  const fragment = document.createDocumentFragment();
  fragment.append(titlePage(storyData));
  fragment.append(...storyData.chapters.map((chapter) => chapterSection(chapter)));

  const footer = document.createElement("footer");
  footer.className = "novel-footer";
  footer.innerHTML = `
    <p class="novel-finish-title">${storyData.title}</p>
    <p class="novel-finish">完</p>
  `;
  fragment.append(footer);

  novel.replaceChildren(fragment);

  cacheLayout();
  renderMenu();
  currentChapterId = null;
  currentTalkId = null;
  updateProgress();
  restoreLastRead();
}

deviceScroll.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", () => {
  cacheLayout();
  onScroll();
});
window.addEventListener("load", () => {
  cacheLayout();
  onScroll();
});

menuToggle.addEventListener("click", () => {
  setMenuOpen(chapterMenu.getAttribute("aria-hidden") === "true");
});

menuBackdrop.addEventListener("click", () => {
  setMenuOpen(false);
});

bookmarkButton.addEventListener("click", () => {
  toggleCurrentBookmark();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
  }
});

render(story);
