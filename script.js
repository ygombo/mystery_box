const state = {
  boxes: [],
  topUpAmounts: [],
  user: null,
  coins: 0,
  history: [],
  profileHistory: []
};

const authPanel = document.querySelector("#auth-panel");
const gamePanel = document.querySelector("#game-panel");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const playerName = document.querySelector("#player-name");
const boxList = document.querySelector("#box-list");
const coinBalance = document.querySelector("#coin-balance");
const resultCard = document.querySelector("#result-card");
const historyList = document.querySelector("#history-list");
const resetButton = document.querySelector("#reset-button");
const clearHistoryButton = document.querySelector("#clear-history-button");
const logoutButton = document.querySelector("#logout-button");
const profileButton = document.querySelector("#profile-button");
const playView = document.querySelector("#play-view");
const profileView = document.querySelector("#profile-view");
const backToGameButton = document.querySelector("#back-to-game-button");
const profileSummary = document.querySelector("#profile-summary");
const topUpList = document.querySelector("#top-up-list");
const topUpMessage = document.querySelector("#top-up-message");
const passwordForm = document.querySelector("#password-form");
const passwordMessage = document.querySelector("#password-message");
const profileHistoryList = document.querySelector("#profile-history-list");

const coinFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function formatCoins(value) {
  return `${coinFormatter.format(value)} coins`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

function setAuthMessage(message) {
  authMessage.textContent = message || "";
}

function setTopUpMessage(message) {
  topUpMessage.textContent = message || "";
}

function setPasswordMessage(message) {
  passwordMessage.textContent = message || "";
}

async function openMysteryBox(box, sourceButton) {
  const sourceCard = sourceButton.closest(".box-card");
  const sourceRect = sourceCard.querySelector(".box-art").getBoundingClientRect();
  sourceCard.classList.add("opening", "charging");
  setButtonsBusy(true);

  try {
    const data = await requestJson("/api/open-box", {
      method: "POST",
      body: JSON.stringify({ boxId: box.id })
    });

    state.user = data.user;
    state.coins = data.user.coins;
    state.history = data.history;

    showResult({
      title: data.play.isJackpot ? "Grand prize opened" : "Prize opened",
      label: data.play.isJackpot ? "Jackpot" : "Win",
      prizeName: data.play.prizeName,
      prizeValue: data.play.prize,
      message: `${data.play.boxName} cost ${formatCoins(data.play.cost)} and revealed ${data.play.prizeName} worth ${formatCoins(data.play.prize)}. Your new balance is ${formatCoins(data.user.coins)}.`,
      status: data.play.isJackpot ? "jackpot" : "win"
    });
    animatePrizeReveal(sourceRect, data.play);
    setTimeout(render, 500);
  } catch (error) {
    showResult({
      title: "Box stayed shut",
      label: "Try again",
      message: error.message,
      status: "blocked"
    });
  } finally {
    setTimeout(() => sourceCard.classList.remove("opening", "charging"), 900);
    setButtonsBusy(false);
  }
}

function setButtonsBusy(isBusy) {
  boxList.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy || state.coins < Number(button.dataset.boxPrice);
  });
}

function showResult(result) {
  resultCard.className = `result-card ${result.status || ""}`.trim();
  const prizeMarkup = result.prizeName
    ? `<div class="result-prize"><span>${result.prizeName}</span><strong>${formatCoins(result.prizeValue)}</strong></div>`
    : "";

  resultCard.innerHTML = `
    <span class="result-label">${result.label}</span>
    <h2>${result.title}</h2>
    ${prizeMarkup}
    <p>${result.message}</p>
  `;
}

function animatePrizeReveal(sourceRect, play) {
  createBoxExplosion(sourceRect, play.isJackpot);

  const flyer = document.createElement("div");
  flyer.className = `prize-flyer ${play.isJackpot ? "jackpot" : ""}`;
  flyer.innerHTML = `
    <span class="prize-icon">${getPrizeInitials(play.prizeName)}</span>
    <span class="prize-copy">
      <strong>${play.prizeName}</strong>
      <small>${formatCoins(play.prize)}</small>
    </span>
  `;

  const startX = sourceRect.left + sourceRect.width / 2 - 110;
  const startY = sourceRect.top + sourceRect.height / 2 - 50;
  const endX = sourceRect.left + sourceRect.width / 2 - 110;
  const endY = sourceRect.top + sourceRect.height / 2 - 58;

  flyer.style.left = `${startX}px`;
  flyer.style.top = `${startY}px`;
  document.body.appendChild(flyer);

  flyer
    .animate(
      [
        { transform: "translate3d(0, 0, 0) scale(0.35) rotate(-8deg)", opacity: 0 },
        { transform: "translate3d(0, -160px, 0) scale(1.18) rotate(4deg)", opacity: 1, offset: 0.38 },
        { transform: `translate3d(${(endX - startX) * 0.68}px, ${endY - startY - 120}px, 0) scale(1.08) rotate(-2deg)`, opacity: 1, offset: 0.68 },
        { transform: `translate3d(${endX - startX}px, ${endY - startY}px, 0) scale(1) rotate(0deg)`, opacity: 1 }
      ],
      {
        duration: 1250,
        easing: "cubic-bezier(.2,.9,.2,1)",
        fill: "forwards"
      }
    )
    .finished.finally(() => {
      setTimeout(() => {
        flyer.classList.add("leaving");
        setTimeout(() => flyer.remove(), 350);
      }, 3000);
    });
}

function createBoxExplosion(sourceRect, isJackpot) {
  const burst = document.createElement("div");
  burst.className = `box-explosion ${isJackpot ? "jackpot" : ""}`;
  burst.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  burst.style.top = `${sourceRect.top + sourceRect.height / 2}px`;

  burst.innerHTML = `
    <span class="boom-light"></span>
    <span class="boom-ring"></span>
    <span class="lid-shard shard-left"></span>
    <span class="lid-shard shard-right"></span>
    <span class="lid-shard shard-front"></span>
  `;

  const colors = isJackpot
    ? ["#f4c542", "#ffe89a", "#d8a51f", "#fff7d7"]
    : ["#27764f", "#2d6ccf", "#d8a51f", "#f7cd4d", "#ffffff"];
  const confettiCount = isJackpot ? 96 : 54;
  const starCount = isJackpot ? 22 : 8;

  for (let index = 0; index < confettiCount; index += 1) {
    const piece = document.createElement("span");
    const angle = (Math.PI * 2 * index) / confettiCount + Math.random() * 0.55;
    const distance = 110 + Math.random() * (isJackpot ? 210 : 130);
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--y", `${Math.sin(angle) * distance - 80}px`);
    piece.style.setProperty("--r", `${Math.random() * 760 - 380}deg`);
    piece.style.setProperty("--delay", `${Math.random() * 140}ms`);
    piece.style.background = colors[index % colors.length];
    burst.appendChild(piece);
  }

  for (let index = 0; index < starCount; index += 1) {
    const star = document.createElement("span");
    const angle = (Math.PI * 2 * index) / starCount + Math.random() * 0.45;
    const distance = 95 + Math.random() * (isJackpot ? 190 : 90);
    star.className = "burst-star";
    star.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    star.style.setProperty("--y", `${Math.sin(angle) * distance - 95}px`);
    star.style.setProperty("--delay", `${80 + Math.random() * 180}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), isJackpot ? 2100 : 1700);
}

function getPrizeInitials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function renderBoxes() {
  boxList.innerHTML = state.boxes
    .map((box) => {
      const canAfford = state.coins >= box.price;

      return `
        <article class="box-card" style="--accent: ${box.accent}">
          <div class="box-title-row">
            <div>
              <h2>${box.name}</h2>
              <span class="box-price">${formatCoins(box.price)}</span>
            </div>
            <span class="odds-pill">${percentFormatter.format(box.jackpotProbability)} odds</span>
          </div>

          <div class="box-art">
            <div class="prize-sparks" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <img src="assets/mystery-box.svg" alt="" aria-hidden="true">
          </div>

          <ul class="prize-details">
            <li><span>${box.jackpotPrizeName}</span><strong>${formatCoins(box.jackpotValue)}</strong></li>
          </ul>

          <button class="open-button" type="button" data-box-id="${box.id}" data-box-price="${box.price}" ${canAfford ? "" : "disabled"}>
            ${canAfford ? "Buy and open" : "Need more coins"}
          </button>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  if (state.history.length === 0) {
    historyList.innerHTML = "<li>No boxes opened yet.</li>";
    return;
  }

  historyList.innerHTML = state.history
    .map((play) => {
      const label = play.isJackpot ? "Grand prize" : "Prize";
      const prizeName = play.prizeName || "Prize";
      return `
        <li>
          <strong>${label}:</strong> ${play.boxName} revealed ${prizeName} worth ${formatCoins(play.prize)}
        </li>
      `;
    })
    .join("");
}

function renderTopUps() {
  topUpList.innerHTML = state.topUpAmounts
    .map(
      (amount) => `
        <button class="secondary-button" type="button" data-top-up-amount="${amount}">
          ${formatCoins(amount)}
        </button>
      `
    )
    .join("");
}

function renderProfileHistory() {
  if (state.profileHistory.length === 0) {
    profileHistoryList.innerHTML = "<li>No profile activity yet.</li>";
    return;
  }

  profileHistoryList.innerHTML = state.profileHistory
    .map((item) => {
      if (item.type === "box_open") {
        const label = item.isJackpot ? "Grand prize" : "Box open";
        const prizeName = item.prizeName || "Prize";
        return `
          <li>
            <strong>${label}:</strong> ${item.title} revealed ${prizeName} worth ${formatCoins(item.prize)}, balance ${formatCoins(item.balance)}
          </li>
        `;
      }

      const label = item.type === "signup_bonus" ? "Signup bonus" : "Coin top up";
      return `
        <li>
          <strong>${label}:</strong> added ${formatCoins(item.amount)}, balance ${formatCoins(item.balance)}
        </li>
      `;
    })
    .join("");
}

function renderProfile() {
  if (!state.user) {
    return;
  }

  profileSummary.textContent = `${state.user.username} has ${formatCoins(state.coins)}.`;
  renderTopUps();
  renderProfileHistory();
}

function render() {
  const isLoggedIn = Boolean(state.user);
  authPanel.classList.toggle("is-hidden", isLoggedIn);
  gamePanel.classList.toggle("is-hidden", !isLoggedIn);
  playerName.textContent = state.user ? `Playing as ${state.user.username}` : "";
  coinBalance.textContent = coinFormatter.format(state.coins);
  renderBoxes();
  renderHistory();
  renderProfile();
}

boxList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-box-id]");
  if (!button) {
    return;
  }

  const box = state.boxes.find((item) => item.id === button.dataset.boxId);
  if (box) {
    openMysteryBox(box, button);
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const action = submitter?.dataset.authAction || "login";
  const formData = new FormData(authForm);

  setAuthMessage("");
  submitter.disabled = true;

  try {
    const data = await requestJson(`/api/${action}`, {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    });

    state.user = data.user;
    state.coins = data.user.coins;
    state.history = data.history || [];
    authForm.reset();
    showResult({
      title: "Choose a mystery box",
      label: "Ready",
      message: "Your prize will appear here after you purchase and open a box.",
      status: ""
    });
    render();
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    submitter.disabled = false;
  }
});

resetButton.addEventListener("click", async () => {
  try {
    const data = await requestJson("/api/reset", { method: "POST" });
    state.user = data.user;
    state.coins = data.user.coins;
    state.history = data.history;
    showResult({
      title: "Coins reset",
      label: "Ready",
      message: "Your balance is back to the starting amount. Choose a box to open next.",
      status: ""
    });
    render();
  } catch (error) {
    showResult({
      title: "Reset failed",
      label: "Try again",
      message: error.message,
      status: "blocked"
    });
  }
});

clearHistoryButton.addEventListener("click", async () => {
  try {
    const data = await requestJson("/api/clear-history", { method: "POST" });
    state.history = data.history;
    renderHistory();
  } catch (error) {
    showResult({
      title: "History stayed put",
      label: "Try again",
      message: error.message,
      status: "blocked"
    });
  }
});

profileButton.addEventListener("click", async () => {
  try {
    const data = await requestJson("/api/profile");
    state.user = data.user;
    state.coins = data.user.coins;
    state.profileHistory = data.profileHistory;
    playView.classList.add("is-hidden");
    profileView.classList.remove("is-hidden");
    render();
  } catch (error) {
    showResult({
      title: "Profile unavailable",
      label: "Try again",
      message: error.message,
      status: "blocked"
    });
  }
});

backToGameButton.addEventListener("click", () => {
  profileView.classList.add("is-hidden");
  playView.classList.remove("is-hidden");
});

topUpList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-top-up-amount]");
  if (!button) {
    return;
  }

  setTopUpMessage("");
  button.disabled = true;

  try {
    const data = await requestJson("/api/top-up", {
      method: "POST",
      body: JSON.stringify({ amount: Number(button.dataset.topUpAmount) })
    });
    state.user = data.user;
    state.coins = data.user.coins;
    state.profileHistory = data.profileHistory;
    setTopUpMessage("Coins added.");
    render();
  } catch (error) {
    setTopUpMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const submitter = event.submitter;

  setPasswordMessage("");
  submitter.disabled = true;

  try {
    await requestJson("/api/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword")
      })
    });
    passwordForm.reset();
    setPasswordMessage("Password updated.");
  } catch (error) {
    setPasswordMessage(error.message);
  } finally {
    submitter.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await requestJson("/api/logout", { method: "POST" });
  state.user = null;
  state.coins = 0;
  state.history = [];
  state.profileHistory = [];
  profileView.classList.add("is-hidden");
  playView.classList.remove("is-hidden");
  render();
});

async function init() {
  try {
    const [config, session] = await Promise.all([
      requestJson("/api/config"),
      requestJson("/api/me")
    ]);

    state.boxes = config.boxes;
    state.topUpAmounts = config.topUpAmounts;
    state.user = session.user;
    state.coins = session.user?.coins || 0;
    state.history = session.history || [];
  } catch (error) {
    setAuthMessage("Start the server with python3 server.py, then reload this page.");
  }

  render();
}

init();
