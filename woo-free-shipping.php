<?php
/**
 * Ambrosia — shipping rates
 * Snippet name: "Ambrosia free shipping"
 *
 * WPCode: Add Snippet -> Add Your Custom Code (New Snippet) -> PHP Snippet
 *         Insert Method: Auto Insert -> Run Everywhere
 *         Status: Active
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 *
 *   Under $200    Standard $12    Expedited $28    Overnight $45
 *   $200 and over Standard FREE   Expedited $28    Overnight $45
 *
 * The $200 is measured on product value BEFORE any discount code, excluding
 * shipping and tax. So a 10% code on a $210 order still earns free shipping.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RATES ARE DEFINED HERE
 *
 * These three replace whatever WooCommerce's shipping zones produce, so the
 * prices cannot drift from the ones cart-store.js shows on the storefront.
 * There is nothing to configure under WooCommerce -> Settings -> Shipping
 * beyond having one shipping method present in the customer's zone, which is
 * what makes WooCommerce ask for rates at all. The existing flat rate does
 * that job; its own price and label are ignored.
 *
 * To change a price or a delivery window, edit AMBROSIA_RATES below. To change
 * the free-shipping threshold, edit AMBROSIA_FREE_SHIPPING_THRESHOLD.
 * ---------------------------------------------------------------------------
 */

if ( ! defined( 'AMBROSIA_FREE_SHIPPING_THRESHOLD' ) ) {
	define( 'AMBROSIA_FREE_SHIPPING_THRESHOLD', 200 );
}

add_filter( 'woocommerce_package_rates', function ( $rates, $package ) {

	if ( ! function_exists( 'WC' ) || ! class_exists( 'WC_Shipping_Rate' ) ) {
		return $rates;
	}

	/* ---- Product value, BEFORE discounts, excluding shipping and tax ----
	   WC()->cart->get_subtotal() is the sum of line subtotals before any
	   coupon is applied. The package's contents_cost is AFTER discounts, so it
	   is only the fallback for the rare case where the cart is unavailable. */

	$product_value = 0.0;

	if ( WC()->cart ) {
		$product_value = (float) WC()->cart->get_subtotal();
	}

	if ( $product_value <= 0 && isset( $package['contents_cost'] ) ) {
		$product_value = (float) $package['contents_cost'];
	}

	$free_standard = $product_value >= (float) AMBROSIA_FREE_SHIPPING_THRESHOLD;

	/* ---- The three options, in the order the customer sees them ---- */

	$definitions = array(
		array(
			'id'    => 'ambrosia_standard',
			'label' => 'Standard',
			'cost'  => $free_standard ? 0.00 : 12.00,
			'note'  => '3–5 business days',
		),
		array(
			'id'    => 'ambrosia_expedited',
			'label' => 'Expedited',
			'cost'  => 28.00,
			'note'  => '2 business days',
		),
		array(
			'id'    => 'ambrosia_overnight',
			'label' => 'Overnight',
			'cost'  => 45.00,
			'note'  => 'Next business day',
		),
	);

	$instance_id = 0;
	if ( ! empty( $rates ) ) {
		$first = reset( $rates );
		if ( $first instanceof WC_Shipping_Rate ) {
			$instance_id = (int) $first->get_instance_id();
		}
	}

	$built = array();

	foreach ( $definitions as $definition ) {

		$rate = new WC_Shipping_Rate(
			$definition['id'],
			$definition['label'],
			(float) $definition['cost'],
			array(),          // research reagents are not taxed
			'ambrosia',
			$instance_id
		);

		/* Woo Blocks surfaces rate meta beneath the label on some layouts. It
		   is decoration — the label and price carry the meaning either way. */
		$rate->add_meta_data( 'Delivery', $definition['note'] );

		$built[ $definition['id'] ] = $rate;
	}

	return $built;

}, 20, 2 );

/**
 * Free-shipping progress notice. A customer $22 short of free shipping should
 * be told, not left to work it out.
 */
add_action( 'woocommerce_before_cart', function () {

	if ( ! function_exists( 'WC' ) || ! WC()->cart ) {
		return;
	}

	$subtotal  = (float) WC()->cart->get_subtotal();
	$threshold = (float) AMBROSIA_FREE_SHIPPING_THRESHOLD;

	if ( $subtotal <= 0 || $subtotal >= $threshold ) {
		return;
	}

	wc_print_notice(
		sprintf(
			'Add %s more for free standard shipping.',
			wp_strip_all_tags( wc_price( $threshold - $subtotal ) )
		),
		'notice'
	);

}, 20 );
