<?php
/**
 * Ambrosia — marketing opt-in at checkout
 * Snippet name: "Ambrosia marketing opt-in"
 *
 * WPCode: Add Snippet -> Add Your Custom Code (New Snippet) -> PHP Snippet
 *         Insert Method: Auto Insert -> Run Everywhere
 *         Status: Active
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * The billing email is collected in order to fulfil an order. Using it to send
 * promotional email is a different purpose and needs its own consent — an
 * order is not permission to market. This adds one unticked checkbox to the
 * contact step and records the answer against the order.
 *
 * Unticked by default, deliberately. A pre-ticked box is not consent under
 * GDPR, and Tennessee's own consumer statute plus CAN-SPAM both favour a
 * recorded affirmative action. It also keeps the list worth having.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE ANSWER SHOWS UP
 *
 * - On the order in WooCommerce -> Orders, under "Additional fields"
 * - In the customer's account details
 * - In an order export, as the ambrosia/marketing-opt-in field
 * - Queryable in bulk via the helper at the bottom of this file:
 *       ambrosia_marketing_optin_emails()
 *
 * Requires WooCommerce 8.9 or newer, which is when additional checkout fields
 * were introduced. On anything older the field simply does not register and
 * checkout is unaffected.
 * ---------------------------------------------------------------------------
 */

add_action( 'woocommerce_blocks_loaded', function () {

	if ( ! function_exists( 'woocommerce_register_additional_checkout_field' ) ) {
		return;
	}

	woocommerce_register_additional_checkout_field(
		array(
			'id'            => 'ambrosia/marketing-opt-in',
			'label'         => 'Email me new lots, certificates and restocks',
			'optionalLabel' => 'Email me new lots, certificates and restocks',
			'location'      => 'contact',
			'type'          => 'checkbox',
			'required'      => false,
		)
	);

} );

/**
 * Every opted-in email address, newest order first.
 *
 * Paste into a WPCode "run once" snippet, or call from wp-admin, to pull the
 * list for an export:
 *
 *     print_r( ambrosia_marketing_optin_emails() );
 *
 * @param int $limit How many orders to scan back through.
 * @return array email => array( 'name' => string, 'date' => string )
 */
function ambrosia_marketing_optin_emails( $limit = 2000 ) {

	if ( ! function_exists( 'wc_get_orders' ) ) {
		return array();
	}

	$orders = wc_get_orders(
		array(
			'limit'   => $limit,
			'orderby' => 'date',
			'order'   => 'DESC',
			'status'  => array( 'wc-processing', 'wc-completed', 'wc-on-hold' ),
		)
	);

	$list = array();

	foreach ( $orders as $order ) {

		$email = $order->get_billing_email();

		if ( ! $email || isset( $list[ $email ] ) ) {
			continue;
		}

		$opted = $order->get_meta( '_wc_other/ambrosia/marketing-opt-in' );

		/* WooCommerce has used a couple of meta prefixes for additional fields
		   across versions; check both rather than silently returning nothing. */
		if ( '' === $opted || is_null( $opted ) ) {
			$opted = $order->get_meta( '_ambrosia/marketing-opt-in' );
		}

		if ( ! $opted || 'no' === $opted || '0' === (string) $opted ) {
			continue;
		}

		$list[ $email ] = array(
			'name' => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
			'date' => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : '',
		);
	}

	return $list;
}
