# Restaurant Billing (HTML/CSS/JS)

Simple restaurant website with **Menu CRUD**, **Cart + Billing**, **Pay Now QR**, **Print bill**, and **Monthly sales report**.

## How to run (Windows)

- Open `index.html` in Chrome/Edge.
  - Tip: right-click → **Open with** → browser

## Features

- **Menu items**: Add / Edit / Delete items (name, price, category, image URL or upload).
- **Billing (POS)**: Click item cards to add to cart, change quantity, tax/discount, clear cart.
- **Pay Now**: Generates a QR code (uses an online QR generator URL).
- **Print bill**: Printable receipt layout.
- **Sales report**: Completing a sale saves it locally and shows it in monthly report; export CSV.

## Notes

- Data is stored in your browser via **localStorage** (menu, cart, sales, settings).
- For multi-user / multi-device billing, you’ll need a backend + database.

