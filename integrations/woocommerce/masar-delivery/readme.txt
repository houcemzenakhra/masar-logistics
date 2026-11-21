=== Masar Delivery ===
Contributors: masar
Tags: algeria, delivery, cash on delivery, shipping, woocommerce
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Send WooCommerce orders to Masar for delivery across Algeria's 69 wilayas, with cash on delivery.

== Description ==

* Send an order from its page (Order actions > Send to Masar), several at once from the orders list, or automatically when an order becomes "Processing".
* The customer's wilaya comes from the order's state (WooCommerce's Algerian states), the commune from the city.
* Cash on delivery orders are collected by the courier; orders paid online are not.
* Each order gets its Masar tracking number in a note, on the customer's order page and in emails.
* Masar tells the shop when the parcel moves. Orders are marked "Completed" when delivered (optional).
* Sending an order twice is safe: Masar recognises the order number.

== Installation ==

1. Upload the plugin and activate it.
2. In your Masar merchant space, open Integrations and create an API key.
3. In WooCommerce > Masar, enter your Masar address and the API key.
4. In Masar, add the webhook address shown on that page, and paste the signing secret Masar gives you back into WooCommerce > Masar.
