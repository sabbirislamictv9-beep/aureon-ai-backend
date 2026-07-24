# Aureon AI Backend Engine

A headless, high-performance Node.js backend built for the **Aureon AI** WhatsApp/Facebook commerce chatbot platform.

## Architecture Highlights
- **Triple Google Sheets DB:** Complete modular separation of data (Inventory, Orders, and Settings) across three distinct sheets.
- **In-Memory Variable Caching:** Eliminates repetitive external database network requests by serving live store data straight from RAM for sub-1.5s execution.
- **Self-Healing Loop:** Automatically downloads system states from the Master Config Sheet using environment variables upon Render cold restarts.

## Endpoints
- `POST /api/connect` - Core server activation and sync.
- `GET /api/products` - Returns cached inventory items.
- `POST /api/products` - Creates new inventory item and hot-reloads memory.
- `GET /api/orders` - Fetches live webhook-captured client sales.