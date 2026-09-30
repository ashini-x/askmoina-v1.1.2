(() => {
  "use strict";

  const root = document.querySelector("#app");
  if (!root) return;

  const API_BASE_URL = String(window.ASKMOINA_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const STORAGE_KEY = "askmoina.conversations.v2";
  const MODE_KEY = "askmoina.mode.v2";
  const MAX_HISTORY = 40;
  const PHRASES = [
    "Thinking through the idea",
    "Exploring a few directions",
    "Connecting the pieces",
    "Working through the details",
    "Shaping a response",
    "Almost there",
  ];
  const MODE_LABELS = { logical: "Logical", auto: "Auto", creative: "Creative" };

  const qs = (selector, scope = root) => scope?.querySelector(selector);
  const qsa = (selector, scope = root) => Array.from(scope?.querySelectorAll(selector) || []);

  const state = {
    mode: localStorage.getItem(MODE_KEY) || "auto",
    messages: [],
    conversations: loadConversations(),
    activeConversationId: crypto.randomUUID(),
    controller: null,
    currentPhase: "idle",
    currentPrompt: "",
    responseText: "",
    responseHtml: "",
    thoughtExpanded: new Set(),
    toastTimer: null,
    renderKey: "",
    followLatest: true,
    thinking: {
      stage: 0,
      queuedStages: [],
      playing: false,
      transitionTimer: null,
      settleTimer: null,
      runToken: 0,
    },
  };

  const PHASE_TO_STAGE = {
    initializing: 0,
    searching: 1,
    synthesizing: 2,
    sandbox: 3,
    auditing: 4,
  };

  function loadConversations() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function persistConversations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations.slice(0, 50)));
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function icon(name) {
    const icons = {
      copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"></path></svg>',
      chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
    };
    return icons[name] || "";
  }

  function showToast(message) {
    const toast = qs("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  function isSimplePrompt(prompt) {
    const normalized = String(prompt || "").trim();
    return normalized.length <= 70 && normalized.split(/\s+/).length <= 12;
  }

  function stageForPhase(phase, prompt) {
    // Always use the original six phrases. For very short prompts, condense the
    // progression without changing its wording. Longer prompts use the full
    // tier-aligned sequence.
    if (isSimplePrompt(prompt)) {
      if (phase === "initializing") return 0;
      if (phase === "searching") return 1;
      if (phase === "synthesizing") return 2;
      if (phase === "sandbox") return 3;
      if (phase === "auditing") return 4;
      return null;
    }
    return Number.isInteger(PHASE_TO_STAGE[phase]) ? PHASE_TO_STAGE[phase] : null;
  }

  function cancelThinkingTransitions() {
    clearTimeout(state.thinking.transitionTimer);
    clearTimeout(state.thinking.settleTimer);
    state.thinking.transitionTimer = null;
    state.thinking.settleTimer = null;
    state.thinking.playing = false;
    state.thinking.queuedStages = [];
    state.thinking.runToken += 1;
  }

  function runNextThinkingStage() {
    if (!qs('#thinkingPhrase') || !qs('#thinking')) return;
    if (!state.thinking.queuedStages.length) {
      state.thinking.playing = false;
      return;
    }

    const phrase = qs('#thinkingPhrase');
    const nextStage = state.thinking.queuedStages.shift();
    const token = state.thinking.runToken;
    state.thinking.playing = true;
    qs('#thinking')?.classList.add('visible');

    phrase.classList.remove('is-in', 'is-resting');
    phrase.classList.add('is-out');

    state.thinking.transitionTimer = setTimeout(() => {
      if (token !== state.thinking.runToken) return;
      state.thinking.stage = nextStage;
      phrase.textContent = PHRASES[nextStage] || PHRASES[0];
      phrase.classList.remove('is-out');
      phrase.classList.add('is-in');

      requestAnimationFrame(() => {
        if (token !== state.thinking.runToken) return;
        phrase.classList.remove('is-in');
        phrase.classList.add('is-resting');
      });

      state.thinking.settleTimer = setTimeout(() => {
        if (token !== state.thinking.runToken) return;
        state.thinking.transitionTimer = null;
        state.thinking.settleTimer = null;
        if (state.thinking.queuedStages.length) {
          runNextThinkingStage();
        } else {
          state.thinking.playing = false;
        }
      }, 720);
    }, 260);
  }

  function requestThinkingStage(stage) {
    if (!Number.isInteger(stage) || stage < 0 || stage >= PHRASES.length) return;
    const lastQueued = state.thinking.queuedStages[state.thinking.queuedStages.length - 1];
    if (stage <= state.thinking.stage && !state.thinking.playing) return;
    if (stage === lastQueued) return;

    // Preserve the original ordered sequence instead of jumping to the newest phase.
    const from = Math.max(state.thinking.stage + 1, 0);
    if (stage > state.thinking.stage) {
      for (let i = from; i <= stage; i += 1) {
        if (i !== state.thinking.stage && !state.thinking.queuedStages.includes(i)) {
          state.thinking.queuedStages.push(i);
        }
      }
    }

    if (!state.thinking.playing) runNextThinkingStage();
  }

  function beginThinking(prompt) {
    cancelThinkingTransitions();
    state.thinking.stage = -1;
    state.thinking.queuedStages = [0];
    state.thinking.playing = false;
    const phrase = qs('#thinkingPhrase');
    if (phrase) {
      phrase.textContent = PHRASES[0];
      phrase.className = 'thinking-phrase is-resting';
    }
    qs('#thinking')?.classList.add('visible');
    state.currentPrompt = prompt;
    runNextThinkingStage();
  }

  function hideThinking() {
    const thinking = qs("#thinking");
    if (!thinking) return;
    thinking.classList.remove("visible");
  }

  function copyText(text) {
    return navigator.clipboard?.writeText(text).catch(() => fallbackCopy(text)) || fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function inlineMarkdown(value) {
    let out = esc(value);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  function markdownToHtml(markdown) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const codeBlocks = [];
    const withoutCode = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CODEBLOCK${codeBlocks.length}@@`;
      codeBlocks.push(`<pre><code class="language-${esc(lang || "text")}">${esc(code.trimEnd())}</code></pre>`);
      return token;
    });

    const lines = withoutCode.split("\n");
    const html = [];
    let paragraph = [];
    let list = null;

    const closeParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!list) return;
      html.push(`</${list}>`);
      list = null;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        closeParagraph();
        closeList();
        continue;
      }
      if (/^@@CODEBLOCK\d+@@$/.test(trimmed)) {
        closeParagraph();
        closeList();
        html.push(trimmed);
        continue;
      }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeParagraph();
        closeList();
        const level = Math.min(3, heading[1].length);
        html.push(`<h${level + 1}>${inlineMarkdown(heading[2])}</h${level + 1}>`);
        continue;
      }
      const quote = trimmed.match(/^>\s?(.*)$/);
      if (quote) {
        closeParagraph();
        closeList();
        html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
        continue;
      }
      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      if (unordered) {
        closeParagraph();
        if (list !== "ul") {
          closeList();
          list = "ul";
          html.push("<ul>");
        }
        html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
        continue;
      }
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        closeParagraph();
        if (list !== "ol") {
          closeList();
          list = "ol";
          html.push("<ol>");
        }
        html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
        continue;
      }
      closeList();
      paragraph.push(trimmed);
    }
    closeParagraph();
    closeList();

    let rendered = html.join("\n");
    rendered = rendered.replace(/@@CODEBLOCK(\d+)@@/g, (_, n) => codeBlocks[Number(n)] || "");
    return rendered || `<p>${inlineMarkdown(text)}</p>`;
  }

  function longPromptHtml(message, index) {
    const key = `${state.activeConversationId}:${index}`;
    const long = message.content.length > 220 || message.content.split(/\s+/).length > 42;
    const expanded = state.thoughtExpanded.has(key);
    return `
      <div class="thought-block">
        <div class="thought-rail" aria-hidden="true"></div>
        <div class="thought-content">
          <div class="thought-preview ${long && !expanded ? "long-collapsed" : ""}">
            <p class="thought-text ${long ? "long" : ""} ${long && !expanded ? "collapsed" : ""}">${esc(message.content)}</p>
            ${long ? `<button class="thought-toggle ${expanded ? "expanded" : ""}" data-thought-toggle="${esc(key)}" type="button" aria-label="${expanded ? "Collapse thought" : "Expand thought"}" title="${expanded ? "Collapse thought" : "Expand thought"}">${icon("chevron")}</button>` : ""}
          </div>
          ${long ? `<div class="thought-tools"><button class="thought-tool" data-copy-thought="${esc(key)}" type="button" aria-label="Copy thought" title="Copy thought"><span class="tool-icon">${icon("copy")}</span></button></div>` : ""}
        </div>
      </div>`;
  }

  function pairHtml(user, assistant, index, isLastUser) {
    let right = "";
    if (assistant) {
      right = `<div class="response-wrap"><div class="answer-rail" aria-hidden="true"></div><div class="response-content"><article class="response visible" data-response-index="${index}"><div class="response-body">${markdownToHtml(assistant.content)}</div><div class="actions"><button class="response-action" data-copy-response="${index}" type="button">Copy</button><button class="response-action" data-regenerate="${index}" type="button">Regenerate</button><button class="response-action" data-more="${index}" type="button">More</button></div></article></div></div>`;
    } else if (isLastUser && state.controller) {
      const stage = stageForPhase(state.currentPhase, user.content) ?? 0;
      right = `<div class="response-wrap"><div class="answer-rail" aria-hidden="true"></div><div class="response-content"><div class="thinking visible" id="thinking"><span aria-hidden="true" class="signal"></span><span class="thinking-phrase is-resting" id="thinkingPhrase">${esc(PHRASES[stage])}</span></div><article class="response" id="response"><div id="responseBody"></div><div class="actions"><button class="response-action" data-copy-response="${index}" type="button">Copy</button><button class="response-action" data-regenerate="${index}" type="button">Regenerate</button><button class="response-action" data-more="${index}" type="button">More</button></div></article></div></div>`;
    }
    return `<div class="conversation-pair" data-pair="${index}">${longPromptHtml(user, index)}${right}</div>`;
  }

  function conversationMarkup() {
    const blocks = [];
    const userIndexes = state.messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
    const lastUserIndex = userIndexes[userIndexes.length - 1];
    for (const index of userIndexes) {
      const user = state.messages[index];
      const assistant = state.messages[index + 1]?.role === "assistant" ? state.messages[index + 1] : null;
      blocks.push(pairHtml(user, assistant, index, index === lastUserIndex));
    }
    return blocks.join("");
  }

  function renderConversation(force = false) {
    const conversation = qs("#conversation");
    const empty = qs("#emptyState");
    if (!conversation || !empty) return;
    const userCount = state.messages.filter((m) => m.role === "user").length;
    empty.style.display = userCount ? "none" : "flex";
    conversation.classList.toggle("active", Boolean(userCount));
    if (!userCount) {
      conversation.innerHTML = "";
      state.renderKey = "";
      updateScrollButton();
      return;
    }

    const key = state.messages.map((m) => `${m.role}:${m.content}`).join("|") + `|${state.activeConversationId}`;
    if (!force && key === state.renderKey && qs(".response#response", conversation)) {
      return;
    }
    state.renderKey = key;
    conversation.innerHTML = conversationMarkup();
    bindConversationControls();
    if (state.controller) {
      requestAnimationFrame(() => {
        const phrase = qs("#thinkingPhrase");
        if (phrase) {
          phrase.textContent = PHRASES[state.thinking.stage] || PHRASES[0];
          phrase.className = "thinking-phrase is-resting";
        }
      });
    }
    updateScrollButton();
  }

  function bindConversationControls() {
    qsa("[data-thought-toggle]").forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.thoughtToggle;
        if (state.thoughtExpanded.has(key)) state.thoughtExpanded.delete(key);
        else state.thoughtExpanded.add(key);
        renderConversation(true);
      };
    });
    qsa("[data-copy-thought]").forEach((button) => {
      button.onclick = async () => {
        const [, indexText] = String(button.dataset.copyThought || "").split(":");
        const message = state.messages[Number(indexText)];
        if (!message) return;
        await copyText(message.content);
        showToast("Thought copied");
      };
    });
    qsa("[data-copy-response]").forEach((button) => {
      button.onclick = async () => {
        const index = Number(button.dataset.copyResponse);
        const message = state.messages[index + 1];
        const text = message?.content || state.responseText;
        if (!text) return;
        await copyText(text);
        showToast("Response copied");
      };
    });
    qsa("[data-regenerate]").forEach((button) => {
      button.onclick = () => regenerate(Number(button.dataset.regenerate));
    });
    qsa("[data-more]").forEach((button) => {
      button.onclick = () => showToast("More controls coming soon");
    });
  }

  function saveConversation() {
    const firstUser = state.messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const payload = {
      id: state.activeConversationId,
      title: firstUser.content.replace(/\s+/g, " ").trim().slice(0, 72) || "New conversation",
      updated_at: new Date().toISOString(),
      messages: state.messages,
    };
    const existing = state.conversations.find((item) => item.id === state.activeConversationId);
    if (existing) Object.assign(existing, payload);
    else state.conversations.unshift(payload);
    state.conversations = state.conversations.slice(0, 50);
    persistConversations();
  }

  function openConversation(id) {
    if (state.controller) return;
    const item = state.conversations.find((entry) => entry.id === id);
    if (!item) return;
    state.activeConversationId = item.id;
    state.messages = structuredClone(item.messages || []);
    state.thoughtExpanded.clear();
    renderConversation(true);
    closeHistory();
    requestAnimationFrame(() => scrollToLatest("instant"));
  }

  function newConversation() {
    if (state.controller) return;
    saveConversation();
    state.messages = [];
    state.activeConversationId = crypto.randomUUID();
    state.thoughtExpanded.clear();
    state.currentPhase = "idle";
    state.responseText = "";
    state.responseHtml = "";
    renderConversation(true);
    renderHistory();
    scrollToLatest("instant");
  }

  function deleteConversation(id) {
    if (state.controller) return;
    state.conversations = state.conversations.filter((entry) => entry.id !== id);
    persistConversations();
    if (id === state.activeConversationId) newConversation();
    else renderHistory();
  }

  function renderHistory() {
    const panel = qs("#historyBackdrop .history-panel");
    if (!panel) return;
    qsa(".history-section.dynamic", panel).forEach((section) => section.remove());
    const section = document.createElement("div");
    section.className = "history-section dynamic";
    const items = state.conversations.length ? state.conversations : [
      { id: "mock-1", title: "Designing a better city", updated_at: "" },
      { id: "mock-2", title: "Product concept", updated_at: "" },
      { id: "mock-3", title: "Interface ideas", updated_at: "" },
    ];
    section.innerHTML = `<div class="history-section-label">Conversations</div>${items.map((item) => `<button class="entry ${item.id === state.activeConversationId ? "selected" : ""}" data-history-id="${esc(item.id)}" type="button"><span class="entry-text">${esc(item.title)}</span><span class="entry-time">${formatTime(item.updated_at)}</span></button>`).join("")}`;
    panel.appendChild(section);
    qsa("[data-history-id]", section).forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.historyId;
        if (id.startsWith("mock-")) showToast("Example history item");
        else openConversation(id);
      };
      button.oncontextmenu = (event) => {
        if (button.dataset.historyId.startsWith("mock-")) return;
        event.preventDefault();
        deleteConversation(button.dataset.historyId);
      };
    });
  }

  function formatTime(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toDateString() === new Date().toDateString()
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function openHistory() {
    renderHistory();
    const backdrop = qs("#historyBackdrop");
    backdrop?.classList.add("open");
    backdrop?.setAttribute("aria-hidden", "false");
  }

  function closeHistory() {
    const backdrop = qs("#historyBackdrop");
    backdrop?.classList.remove("open");
    backdrop?.setAttribute("aria-hidden", "true");
  }

  function scrollSurface() { return root; }

  function scrollToLatest(behavior = "smooth") {
    scrollSurface().scrollTo({ top: scrollSurface().scrollHeight, behavior });
  }

  function updateScrollButton() {
    const button = qs("#scrollLatest");
    if (!button) return;
    const surface = scrollSurface();
    const distance = surface.scrollHeight - surface.scrollTop - surface.clientHeight;
    button.classList.toggle("visible", distance > 180);
  }

  function updateFollowState() {
    const surface = scrollSurface();
    const distance = surface.scrollHeight - surface.scrollTop - surface.clientHeight;
    state.followLatest = distance < 230;
    updateScrollButton();
  }

  function updateComposerHeight() {
    const wrap = qs(".composer-wrap");
    if (!wrap) return;
    const height = Math.ceil(wrap.getBoundingClientRect().height);
    root.style.setProperty("--composer-stack-height", `${height}px`);
    root.style.setProperty("--composer-clearance", `${height + 112}px`);
  }

  function resizeInput() {
    const input = qs("#input");
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
    requestAnimationFrame(updateComposerHeight);
  }

  function setBusy(busy) {
    qsa(".mode").forEach((button) => {
      button.disabled = busy;
      button.classList.toggle("disabled", busy);
    });
    const send = qs("#sendBtn");
    const input = qs("#input");
    if (send) send.disabled = busy || !input?.value.trim();
  }

  function updateSendState() {
    const input = qs("#input");
    const send = qs("#sendBtn");
    if (!input || !send) return;
    send.disabled = Boolean(state.controller) || !input.value.trim();
    send.classList.toggle("disabled", send.disabled);
  }

  function buildMessagesForApi(userIndex) {
    return state.messages
      .slice(0, userIndex)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-MAX_HISTORY);
  }

  function parseSSE(buffer) {
    const events = [];
    let rest = buffer;
    while (true) {
      const match = /\r?\n\r?\n/.exec(rest);
      if (!match || match.index == null) break;
      const frame = rest.slice(0, match.index);
      rest = rest.slice(match.index + match[0].length);
      let event = "message";
      const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      const payload = data.join("\n");
      if (payload === "[DONE]") {
        events.push({ event: "done", data: null });
        continue;
      }
      try { events.push({ event, data: JSON.parse(payload) }); } catch { /* ignore malformed frame */ }
    }
    return { events, rest };
  }

  function ensureStreamingResponse(index) {
    const pair = qs(`.conversation-pair[data-pair="${index}"]`);
    if (!pair) return null;
    let article = qs(".response", pair);
    if (!article) {
      const contentArea = qs(".response-content", pair);
      if (!contentArea) return null;
      article = document.createElement("article");
      article.className = "response visible";
      article.innerHTML = `<div class="response-body" id="liveResponseBody"></div><div class="actions"><button class="response-action" data-copy-response="${index}" type="button">Copy</button><button class="response-action" data-regenerate="${index}" type="button">Regenerate</button><button class="response-action" data-more="${index}" type="button">More</button></div>`;
      contentArea.appendChild(article);
      bindConversationControls();
    }
    return qs(".response-body", article);
  }

  function updateLiveResponse(text) {
    state.responseText = text;
    const body = qs("#liveResponseBody") || qs("#responseBody");
    if (!body) return;
    body.textContent = text;
    const article = body.closest(".response");
    article?.classList.add("visible");
  }

  function handlePhase(data) {
    state.currentPhase = data?.phase || state.currentPhase;
    const stage = stageForPhase(state.currentPhase, state.currentPrompt);
    if (stage !== null) requestThinkingStage(stage);
  }

  function finalizeResponse(index, content) {
    const finalContent = String(content || state.responseText || "");
    if (!finalContent) return;
    state.messages[index + 1] = { role: "assistant", content: finalContent };
    saveConversation();
    state.renderKey = "";
  }

  async function runChat(prompt, operation = "submit", userIndex = null) {
    if (state.controller) return;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;

    if (operation === "submit") {
      state.messages.push({ role: "user", content: cleanPrompt });
      userIndex = state.messages.length - 1;
    } else if (operation === "regenerate") {
      if (typeof userIndex !== "number") return;
      state.messages = state.messages.slice(0, userIndex + 1);
    }

    state.currentPhase = "initializing";
    state.currentPrompt = cleanPrompt;
    state.responseText = "";
    state.responseHtml = "";
    state.controller = new AbortController();
    beginThinking(cleanPrompt);
    renderConversation(true);
    setBusy(true);
    requestAnimationFrame(() => {
      scrollToLatest("smooth");
      resizeInput();
    });

    const messages = buildMessagesForApi(userIndex);
    let buffer = "";
    let finalText = "";

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, mode: state.mode, messages }),
        signal: state.controller.signal,
      });
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `AskMoina request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSSE(buffer);
        buffer = parsed.rest;
        for (const packet of parsed.events) {
          if (packet.event === "phase") {
            handlePhase(packet.data);
          } else if (packet.event === "delta") {
            const text = String(packet.data?.text || "");
            if (text) {
              finalText += text;
              cancelThinkingTransitions();
              hideThinking();
              updateLiveResponse(finalText);
            }
          } else if (packet.event === "replace") {
            finalText = String(packet.data?.text || "");
            hideThinking();
            updateLiveResponse(finalText);
          } else if (packet.event === "error") {
            throw new Error(String(packet.data?.message || "AskMoina could not complete the request."));
          } else if (packet.event === "complete") {
            state.currentPhase = "complete";
            if (!finalText) {
              state.thinking.queuedStages = [5];
              state.thinking.playing = false;
              runNextThinkingStage();
            }
          }

          if (state.followLatest && (packet.event === "delta" || packet.event === "replace")) {
            scrollToLatest("auto");
          }
        }
      }

      if (!finalText) finalText = state.responseText;
      finalizeResponse(userIndex, finalText);
    } catch (error) {
      if (error?.name !== "AbortError") {
        showToast(error instanceof Error ? error.message : "Unable to reach AskMoina");
        state.messages = state.messages.slice(0, userIndex + 1);
      }
    } finally {
      hideThinking();
      cancelThinkingTransitions();
      state.controller = null;
      state.currentPhase = "idle";
      setBusy(false);
      renderConversation(true);
      requestAnimationFrame(() => {
        scrollToLatest("smooth");
        updateComposerHeight();
      });
      updateSendState();
    }
  }

  function regenerate(index) {
    const prompt = state.messages[index]?.content;
    if (prompt) runChat(prompt, "regenerate", index);
  }

  // Header + settings
  qs("#historyBtn")?.addEventListener("click", openHistory);
  qs("#closeHistory")?.addEventListener("click", closeHistory);
  qs("#historyBackdrop")?.addEventListener("click", (event) => {
    if (event.target === qs("#historyBackdrop")) closeHistory();
  });
  qs("#newBtn")?.addEventListener("click", newConversation);
  qs("#settingsBtn")?.addEventListener("click", () => showToast("Live Search and Sandbox are always on"));

  // Modes
  qsa(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.controller) return;
      state.mode = button.dataset.mode || "auto";
      localStorage.setItem(MODE_KEY, state.mode);
      qsa(".mode").forEach((item) => {
        const active = item.dataset.mode === state.mode;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      showToast(`${MODE_LABELS[state.mode]} mode`);
    });
  });

  // Composer
  const input = qs("#input");
  input?.addEventListener("input", () => {
    resizeInput();
    updateSendState();
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runChat(input.value);
      input.value = "";
      resizeInput();
      updateSendState();
    }
  });
  qs("#sendBtn")?.addEventListener("click", () => {
    if (!input?.value.trim()) return;
    const prompt = input.value;
    input.value = "";
    resizeInput();
    updateSendState();
    runChat(prompt);
  });
  qs("#attachBtn")?.addEventListener("click", () => showToast("Attachments are reserved for a later release"));

  // Suggestions
  qsa("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!input) return;
      input.value = button.dataset.suggestion || "";
      resizeInput();
      input.focus();
      updateSendState();
    });
  });

  // Navigation
  scrollSurface().addEventListener("scroll", updateFollowState, { passive: true });
  qs("#scrollLatest")?.addEventListener("click", () => scrollToLatest("smooth"));
  window.addEventListener("resize", () => {
    resizeInput();
    updateComposerHeight();
    updateScrollButton();
  });

  qsa(".mode").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  renderConversation(true);
  renderHistory();
  requestAnimationFrame(() => {
    resizeInput();
    updateComposerHeight();
    updateScrollButton();
  });
})();
