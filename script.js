/* ---------- DOM references ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const rtlToggle = document.getElementById("rtlToggle");

/* Replace with your actual deployed Cloudflare Worker URL */
const WORKER_URL = "https://loreal-chatbot.prattla5.workers.dev";

/* ---------- State ---------- */
let allProducts = [];
let selectedProducts = JSON.parse(localStorage.getItem("selectedProducts")) || [];
let conversationHistory = [];
let currentCategory = "";
let currentSearchTerm = "";

/* ---------- Initial placeholder ---------- */
productsContainer.innerHTML = `
  <div class="placeholder-message">Select a category to view products</div>
`;

/* ---------- Load products (cached after first fetch) ---------- */
async function loadProducts() {
  if (allProducts.length) return allProducts;
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* ---------- localStorage persistence ---------- */
function saveSelectedProducts() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

function isSelected(id) {
  return selectedProducts.some((p) => p.id === id);
}

/* ---------- Toggle a product's selected state ---------- */
function toggleProductSelection(product) {
  if (isSelected(product.id)) {
    selectedProducts = selectedProducts.filter((p) => p.id !== product.id);
  } else {
    selectedProducts.push(product);
  }
  saveSelectedProducts();
  renderSelectedProducts();

  const card = productsContainer.querySelector(`[data-id="${product.id}"]`);
  if (card) card.classList.toggle("selected", isSelected(product.id));
}

/* ---------- Render product grid ---------- */
function displayProducts(products) {
  if (!products.length) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found.</div>`;
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card ${isSelected(product.id) ? "selected" : ""}" data-id="${product.id}">
      <button class="info-btn" data-id="${product.id}" aria-label="View description of ${product.name}">
        <i class="fa-solid fa-circle-info"></i>
      </button>
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `
    )
    .join("");
}

/* ---------- Combined category + search filtering ---------- */
function applyFilters() {
  let filtered = allProducts;

  if (currentCategory) {
    filtered = filtered.filter((p) => p.category === currentCategory);
  }

  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.brand.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
  }

  if (!currentCategory && !currentSearchTerm) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">Select a category or search to view products</div>
    `;
    return;
  }

  displayProducts(filtered);
}

/* ---------- Render the "Selected Products" panel ---------- */
function renderSelectedProducts() {
  if (!selectedProducts.length) {
    selectedProductsList.innerHTML = `<p class="placeholder-message">No products selected yet.</p>`;
    return;
  }

  selectedProductsList.innerHTML = `
    ${selectedProducts
      .map(
        (product) => `
      <div class="selected-item" data-id="${product.id}">
        <img src="${product.image}" alt="${product.name}">
        <span>${product.name}</span>
        <button class="remove-btn" data-id="${product.id}" aria-label="Remove ${product.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `
      )
      .join("")}
    <button id="clearAllBtn" class="clear-all-btn">Clear All</button>
  `;
}

/* ---------- Description modal ---------- */
function showDescriptionModal(product) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" aria-label="Close">&times;</button>
      <img src="${product.image}" alt="${product.name}">
      <h3>${product.name}</h3>
      <p class="modal-brand">${product.brand}</p>
      <p class="modal-description">${product.description}</p>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

/* ---------- Category filter ---------- */
categoryFilter.addEventListener("change", async (e) => {
  await loadProducts();
  currentCategory = e.target.value;
  applyFilters();
});

/* ---------- Search field (live filtering as user types) ---------- */
productSearch.addEventListener("input", async (e) => {
  await loadProducts();
  currentSearchTerm = e.target.value.trim();
  applyFilters();
});

/* ---------- Grid clicks: select card OR open info modal ---------- */
productsContainer.addEventListener("click", (e) => {
  const infoBtn = e.target.closest(".info-btn");
  const card = e.target.closest(".product-card");
  if (!card) return;

  const id = Number(card.dataset.id);
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  if (infoBtn) {
    showDescriptionModal(product);
    return;
  }
  toggleProductSelection(product);
});

/* ---------- Selected list clicks: remove one OR clear all ---------- */
selectedProductsList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".remove-btn");
  const clearBtn = e.target.closest("#clearAllBtn");

  if (removeBtn) {
    const id = Number(removeBtn.dataset.id);
    selectedProducts = selectedProducts.filter((p) => p.id !== id);
    saveSelectedProducts();
    renderSelectedProducts();
    productsContainer.querySelector(`[data-id="${id}"]`)?.classList.remove("selected");
  }

  if (clearBtn) {
    selectedProducts = [];
    saveSelectedProducts();
    renderSelectedProducts();
    productsContainer
      .querySelectorAll(".product-card.selected")
      .forEach((card) => card.classList.remove("selected"));
  }
});

/* ---------- Chat helpers ---------- */
function addChatMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.textContent = role === "user" ? `You: ${text}` : text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- Talk to your Cloudflare Worker ---------- */
async function callWorker(messages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Something went wrong.");
  return data.choices[0].message.content;
}

/* ---------- Generate Routine ---------- */
generateRoutineBtn.addEventListener("click", async () => {
  if (!selectedProducts.length) {
    addChatMessage("assistant", "Please select at least one product first!");
    return;
  }

  chatWindow.innerHTML = "";

  const productData = selectedProducts.map(({ name, brand, category, description }) => ({
    name,
    brand,
    category,
    description,
  }));

  const userMessage = `Using ONLY these selected products, create a step-by-step personalized routine (morning and/or evening as relevant), explaining the order of use and why each product fits: ${JSON.stringify(productData)}`;

  conversationHistory = [{ role: "user", content: userMessage }];

  const thinkingMsg = document.createElement("div");
  thinkingMsg.className = "chat-message assistant thinking";
  thinkingMsg.textContent = "Thinking...";
  chatWindow.appendChild(thinkingMsg);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const reply = await callWorker(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    thinkingMsg.remove();
    addChatMessage("assistant", reply);
  } catch (err) {
    thinkingMsg.remove();
    addChatMessage("assistant", `Sorry, something went wrong: ${err.message}`);
  }
});

/* ---------- Follow-up chat ---------- */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question) return;

  addChatMessage("user", question);
  userInput.value = "";
  conversationHistory.push({ role: "user", content: question });

  const thinkingMsg = document.createElement("div");
  thinkingMsg.className = "chat-message assistant thinking";
  thinkingMsg.textContent = "Thinking...";
  chatWindow.appendChild(thinkingMsg);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const reply = await callWorker(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    thinkingMsg.remove();
    addChatMessage("assistant", reply);
  } catch (err) {
    thinkingMsg.remove();
    addChatMessage("assistant", `Sorry, something went wrong: ${err.message}`);
  }
});

/* ---------- RTL toggle ---------- */
rtlToggle.addEventListener("click", () => {
  const isRTL = document.documentElement.dir === "rtl";
  document.documentElement.dir = isRTL ? "ltr" : "rtl";
  document.documentElement.lang = isRTL ? "en" : "ar";
});

/* ---------- Init ---------- */
renderSelectedProducts();
loadProducts();