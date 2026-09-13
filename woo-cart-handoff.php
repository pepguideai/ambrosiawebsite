<?php
/**
 * Ambrosia — cart handoff receiver
 * Snippet name: "Ambrosia cart handoff"
 *
 * WPCode: Add Snippet -> Add Your Custom Code (New Snippet) -> PHP Snippet
 *         Insert Method: Auto Insert -> Run Everywhere
 *         Status: Active
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES
 *
 * The static storefront keeps its own cart in the browser. When the customer
 * checks out, it sends that cart here as a single top-level navigation. This
 * runs on WordPress's own host, so WooCommerce creates its session first-party,
 * builds the real cart server-side, and forwards the customer to checkout
 * already holding it.
 *
 * No CORS. No REST nonce. No Cart-Token. No reverse proxy. No cross-site
 * cookie, which is what Safari blocks on iOS.
 *
 * ---------------------------------------------------------------------------
 * PARAMETERS (GET or POST)
 *
 *   ambrosia_handoff  required, any truthy value
 *   cart              required, JSON array: [{"id":28,"qty":1},{"id":31,"qty":2}]
 *                     ids are WooCommerce product ids, or VARIATION ids for
 *                     variable products — the parent is resolved here
 *   coupon            optional coupon code typed by the customer
 *   welcome           optional, 1 applies the welcome coupon. Its CODE lives
 *                     only in this file, never on the storefront, so it cannot
 *                     be read out of a public JavaScript file and shared
 *   optin             optional, 1 records marketing consent on the order
 *   debug             optional, 1 prints a plain-text report instead of
 *                     redirecting to checkout
 *
 * ---------------------------------------------------------------------------
 * DESIGN NOTE
 *
 * Every product is resolved and validated BEFORE the cart is touched. An
 * earlier version emptied the cart first and then added, so any failure left
 * the customer with an empty cart. Now a failure changes nothing.
 * ---------------------------------------------------------------------------
 */

if ( ! defined( 'AMBROSIA_WELCOME_COUPON' ) ) {
	/* The welcome offer's real coupon code. Keep it here and nowhere else — the
	   storefront asks for it by flag, not by name. Must match a coupon under
	   WooCommerce -> Marketing -> Coupons. */
	define( 'AMBROSIA_WELCOME_COUPON', 'WELCOME10' );
}

add_action( 'init', function () {

	$req = array_merge( $_GET, $_POST );

	if ( empty( $req['ambrosia_handoff'] ) ) {
		return;
	}

	$debug  = ! empty( $req['debug'] );
	$report = array();

	/**
	 * Bail out. In debug mode print everything gathered so far; otherwise send
	 * the customer back to the static cart with the reason in the query string.
	 */
	$bail = function ( $message ) use ( $debug, &$report ) {

		if ( $debug ) {
			if ( ! headers_sent() ) {
				header( 'Content-Type: text/plain; charset=utf-8' );
			}
			echo "AMBROSIA CART HANDOFF — FAILED\n\n";
			echo $message . "\n";
			if ( $report ) {
				echo "\n" . implode( "\n", $report ) . "\n";
			}
			exit;
		}

		wp_safe_redirect( 'https://www.ambrosiastandard.com/cart?handoff=' . rawurlencode( $message ) );
		exit;
	};

	/* ---- WooCommerce has to be up before we can do anything ---- */

	if ( ! function_exists( 'WC' ) || ! function_exists( 'wc_get_product' ) ) {
		$bail( 'WooCommerce is not loaded on this request.' );
	}

	/* ---- Parse the incoming cart ---- */

	$raw = isset( $req['cart'] ) ? wp_unslash( $req['cart'] ) : '';

	$lines = null;

	/* Simple alternative format for hand-typed tests: items=28:1,31:2
	   JSON in a URL gets mangled by some mobile browsers, so this avoids
	   braces and quotes entirely. The real site still posts JSON. */
	if ( isset( $req['items'] ) ) {

		$lines = array();
		$pairs = explode( ',', wp_unslash( $req['items'] ) );

		foreach ( $pairs as $pair ) {
			$pair = trim( $pair );
			if ( '' === $pair ) {
				continue;
			}
			$bits = explode( ':', $pair );
			$lines[] = array(
				'id'  => absint( $bits[0] ),
				'qty' => isset( $bits[1] ) ? absint( $bits[1] ) : 1,
			);
		}

	} elseif ( '' !== trim( (string) $raw ) ) {

		$lines = json_decode( $raw, true );

		if ( ! is_array( $lines ) ) {
			$bail(
				'Cart parameter was not valid JSON. Length received: '
				. strlen( (string) $raw )
				. '. Value: ' . substr( (string) $raw, 0, 300 )
				. '. Try the items=ID:QTY format instead.'
			);
		}

	} else {
		$bail( 'No cart or items parameter was sent.' );
	}

	if ( ! is_array( $lines ) || ! count( $lines ) ) {
		$bail( 'No usable cart lines were received.' );
	}

	/* ---- Resolve and validate every line. Change nothing yet. ---- */

	$resolved = array();
	$problems = array();

	foreach ( $lines as $line ) {

		if ( ! is_array( $line ) ) {
			$problems[] = 'a cart line was not an object';
			continue;
		}

		$id  = isset( $line['id'] ) ? absint( $line['id'] ) : 0;
		$qty = isset( $line['qty'] ) ? absint( $line['qty'] ) : 1;
		$qty = max( 1, min( 99, $qty ) );

		if ( ! $id ) {
			$problems[] = 'a cart line had no product id';
			continue;
		}

		$product = wc_get_product( $id );

		if ( ! $product ) {
			$problems[] = "id {$id}: no such product in WooCommerce";
			continue;
		}

		$name = $product->get_name();

		if ( 'publish' !== $product->get_status() && ! current_user_can( 'edit_posts' ) ) {
			$problems[] = "id {$id} ({$name}): not published";
			continue;
		}

		if ( ! $product->is_purchasable() ) {
			$problems[] = "id {$id} ({$name}): not purchasable — it needs a price set";
			continue;
		}

		if ( ! $product->is_in_stock() ) {
			$problems[] = "id {$id} ({$name}): out of stock";
			continue;
		}

		if ( ! $product->has_enough_stock( $qty ) ) {
			$problems[] = "id {$id} ({$name}): fewer than {$qty} in stock";
			continue;
		}

		/* A variation must be added against its parent, with the variation id
		   passed separately, or WooCommerce rejects it. */
		if ( $product->is_type( 'variation' ) ) {
			$parent_id    = $product->get_parent_id();
			$variation_id = $product->get_id();
		} else {
			$parent_id    = $product->get_id();
			$variation_id = 0;
		}

		if ( ! $parent_id ) {
			$problems[] = "id {$id} ({$name}): variation has no parent product";
			continue;
		}

		$resolved[] = array(
			'parent'    => $parent_id,
			'variation' => $variation_id,
			'qty'       => $qty,
			'label'     => $name . ' [' . $id . ']',
		);

		$report[] = sprintf(
			'OK   id %d -> parent %d%s x%d  %s',
			$id,
			$parent_id,
			$variation_id ? ' variation ' . $variation_id : '',
			$qty,
			$name
		);
	}

	foreach ( $problems as $problem ) {
		$report[] = 'ERR  ' . $problem;
	}

	if ( count( $problems ) ) {
		$bail( 'Could not resolve: ' . implode( ' | ', $problems ) );
	}

	if ( ! count( $resolved ) ) {
		$bail( 'Nothing to add.' );
	}

	/* ---- Everything checks out. Now it is safe to rebuild the cart. ---- */

	if ( is_null( WC()->session ) ) {
		$bail( 'WooCommerce session handler is unavailable on this request.' );
	}

	if ( ! WC()->session->has_session() ) {
		WC()->session->set_customer_session_cookie( true );
	}

	if ( is_null( WC()->cart ) ) {
		$bail( 'WooCommerce cart object is unavailable on this request.' );
	}

	wc_clear_notices();

	WC()->cart->empty_cart();

	$added = 0;

	foreach ( $resolved as $item ) {

		/* Deliberately no fourth argument. Passing the variation's attribute map
		   here caused WooCommerce to accept the item and then invalidate it on the
		   next request ("X was removed from your cart"), because custom non-
		   taxonomy attribute keys have to match exactly. The variation id alone is
		   unambiguous — let Woo resolve the attributes itself. */
		$key = WC()->cart->add_to_cart(
			$item['parent'],
			$item['qty'],
			$item['variation']
		);

		if ( $key ) {
			$added++;
			$report[] = 'ADD  ' . $item['label'] . ' x' . $item['qty'];
			continue;
		}

		$notices = wc_get_notices( 'error' );
		$reasons = array();

		foreach ( $notices as $notice ) {
			$text = is_array( $notice ) && isset( $notice['notice'] ) ? $notice['notice'] : $notice;
			$reasons[] = wp_strip_all_tags( (string) $text );
		}

		wc_clear_notices();

		$report[] = 'FAIL ' . $item['label']
			. ( $reasons ? ' — ' . implode( '; ', $reasons ) : ' — WooCommerce gave no reason' );
	}

	if ( ! $added ) {
		$bail( 'WooCommerce accepted none of the items.' );
	}

	/* ---- Coupons ---- */

	$coupon = isset( $req['coupon'] ) ? sanitize_text_field( wp_unslash( $req['coupon'] ) ) : '';

	/* A typed partner code takes precedence: it is worth more than the welcome
	   offer, and the two must never stack. */
	if ( '' === $coupon && ! empty( $req['welcome'] ) ) {
		$coupon = AMBROSIA_WELCOME_COUPON;
	}

	if ( '' !== $coupon ) {
		if ( WC()->cart->has_discount( $coupon ) ) {
			$report[] = 'CPN  ' . $coupon . ' already applied';
		} else {
			WC()->cart->apply_coupon( $coupon );
			$report[] = WC()->cart->has_discount( $coupon )
				? 'CPN  ' . $coupon . ' applied'
				: 'CPN  ' . $coupon . ' rejected by WooCommerce';
		}
		wc_clear_notices();
	}

	/* ---- Marketing consent ----
	   Held on the session so it can be written onto the order once checkout
	   completes, where it sits beside the email address it applies to. */

	if ( ! empty( $req['optin'] ) ) {
		WC()->session->set( 'ambrosia_marketing_optin', 'yes' );
		$report[] = 'OPT  marketing consent recorded';
	}

	/* ---- Persist and hand over ---- */

	WC()->cart->calculate_totals();
	WC()->session->save_data();

	/* Hand over on WordPress's OWN host.

	   WP_HOME points at www, so wc_get_checkout_url() returns
	   https://www.ambrosiastandard.com/checkout/ — which Vercel has to proxy
	   back here, and the cart session does not survive that round trip. The
	   cart we just built is sitting on this host, so send the customer to this
	   host. WP_SITEURL already names it. */
	$checkout_url = wc_get_checkout_url();

	$home_base = untrailingslashit( home_url() );
	$site_base = untrailingslashit( site_url() );

	if ( $home_base !== $site_base && 0 === strpos( $checkout_url, $home_base ) ) {
		$checkout_url = $site_base . substr( $checkout_url, strlen( $home_base ) );
	}

	$report[] = 'CART ' . WC()->cart->get_cart_contents_count() . ' item(s)';
	$report[] = 'TOTL ' . wp_strip_all_tags( WC()->cart->get_total() );
	$report[] = 'NEXT ' . $checkout_url;

	if ( $debug ) {
		if ( ! headers_sent() ) {
			header( 'Content-Type: text/plain; charset=utf-8' );
		}
		echo "AMBROSIA CART HANDOFF — OK\n\n";
		echo implode( "\n", $report ) . "\n";
		exit;
	}

	wp_redirect( $checkout_url );
	exit;

}, 5 );

/**
 * Write the cart-page consent onto the finished order. Two hooks because the
 * block checkout and the classic checkout create orders by different routes.
 */
function ambrosia_stamp_marketing_optin( $order ) {

	if ( ! function_exists( 'WC' ) || is_null( WC()->session ) ) {
		return;
	}

	if ( 'yes' !== WC()->session->get( 'ambrosia_marketing_optin' ) ) {
		return;
	}

	$order->update_meta_data( '_ambrosia_marketing_optin', 'yes' );
	$order->update_meta_data( '_ambrosia_marketing_optin_source', 'welcome offer unlocked on cart' );
}

add_action( 'woocommerce_checkout_create_order', 'ambrosia_stamp_marketing_optin', 10, 1 );

add_action( 'woocommerce_store_api_checkout_update_order_from_request', function ( $order ) {
	ambrosia_stamp_marketing_optin( $order );
	$order->save();
}, 10, 1 );

/**
 * Show the consent on the order screen, next to the email it applies to.
 */
add_action( 'woocommerce_admin_order_data_after_billing_address', function ( $order ) {

	if ( 'yes' !== $order->get_meta( '_ambrosia_marketing_optin' ) ) {
		return;
	}

	echo '<p><strong>Marketing consent:</strong> yes &mdash; unlocked the welcome offer on the cart page</p>';

}, 10, 1 );
