<?php
/**
 * Ambrosia — mystery offer signup endpoint
 * Snippet name: "Mystery offer signup"
 *
 * WPCode: Add Snippet -> Add Your Custom Code (New Snippet) -> PHP Snippet
 *         Insert Method: Auto Insert -> Run Everywhere
 *         Status: Active
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 *
 * Receives the email from the homepage mystery-offer popup:
 *
 *     POST /wp-json/ambrosia/v1/offer-signup
 *     { "email": "someone@example.com", "source": "homepage-popup" }
 *     -> { "code": "WELCOME10-4KQ7" }
 *
 * For each address it:
 *   1. records a private subscriber entry (wp-admin -> Offer signups)
 *   2. mints a single-use WooCommerce coupon locked to that email —
 *      10% off, no order minimum, expires in 30 days
 *   3. fires  do_action( 'ambrosia_offer_signup', $email, $code, $source )
 *      so the email and affiliate plugins can pick it up
 *
 * A repeat submission returns the same code rather than minting a second one.
 *
 * [VERIFY] The two guarded blocks at the bottom push the address into FluentCRM
 * and Mailchimp for WordPress if either is active. Replace that section with
 * the call your actual email/affiliate plugin exposes — everything else works
 * regardless.
 * ---------------------------------------------------------------------------
 */

const AMBROSIA_OFFER_PERCENT = 10;
const AMBROSIA_OFFER_DAYS    = 30;
const AMBROSIA_OFFER_CPT     = 'amb_offer_signup';

/* ---------------------------------------------------------------------------
 * Subscriber store — a private post type, so the list is browsable in wp-admin
 * and exportable with the tools already there.
 * ------------------------------------------------------------------------ */

add_action( 'init', function () {
	register_post_type(
		AMBROSIA_OFFER_CPT,
		array(
			'label'           => 'Offer signups',
			'public'          => false,
			'show_ui'         => true,
			'show_in_menu'    => true,
			'menu_icon'       => 'dashicons-email-alt',
			'capability_type' => 'post',
			'capabilities'    => array( 'create_posts' => 'do_not_allow' ),
			'map_meta_cap'    => true,
			'supports'        => array( 'title', 'custom-fields' ),
		)
	);
} );

/* ---------------------------------------------------------------------------
 * Route
 * ------------------------------------------------------------------------ */

add_action( 'rest_api_init', function () {
	register_rest_route(
		'ambrosia/v1',
		'/offer-signup',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => 'ambrosia_offer_signup',
			'args'                => array(
				'email'  => array( 'required' => true, 'type' => 'string' ),
				'source' => array( 'required' => false, 'type' => 'string' ),
			),
		)
	);
} );

function ambrosia_offer_signup( WP_REST_Request $request ) {

	$email  = sanitize_email( (string) $request->get_param( 'email' ) );
	$source = sanitize_text_field( (string) $request->get_param( 'source' ) );

	if ( ! is_email( $email ) ) {
		return new WP_Error( 'ambrosia_bad_email', 'A valid email address is required.', array( 'status' => 400 ) );
	}

	/* Light rate limit: ten signups per IP per hour. */
	$key   = 'amb_offer_' . md5( ambrosia_offer_ip() );
	$count = (int) get_transient( $key );
	if ( $count > 10 ) {
		return new WP_Error( 'ambrosia_rate_limited', 'Too many requests. Try again shortly.', array( 'status' => 429 ) );
	}
	set_transient( $key, $count + 1, HOUR_IN_SECONDS );

	$existing = ambrosia_offer_find( $email );

	if ( $existing ) {
		return rest_ensure_response( array( 'code' => get_post_meta( $existing, '_amb_code', true ) ) );
	}

	$code = ambrosia_offer_mint( $email );

	$id = wp_insert_post(
		array(
			'post_type'   => AMBROSIA_OFFER_CPT,
			'post_status' => 'publish',
			'post_title'  => $email,
		)
	);

	if ( $id && ! is_wp_error( $id ) ) {
		update_post_meta( $id, '_amb_email', $email );
		update_post_meta( $id, '_amb_code', $code );
		update_post_meta( $id, '_amb_source', $source ?: 'unknown' );
		update_post_meta( $id, '_amb_time', gmdate( 'c' ) );
		update_post_meta( $id, '_amb_ip', ambrosia_offer_ip() );
	}

	/**
	 * Hand-off point for the email and affiliate systems.
	 *
	 * add_action( 'ambrosia_offer_signup', function ( $email, $code, $source ) { ... }, 10, 3 );
	 */
	do_action( 'ambrosia_offer_signup', $email, $code, $source );

	ambrosia_offer_push_to_crm( $email, $code, $source );

	return rest_ensure_response( array( 'code' => $code ) );
}

function ambrosia_offer_ip() {
	if ( class_exists( 'WC_Geolocation' ) ) {
		return WC_Geolocation::get_ip_address();
	}
	return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
}

function ambrosia_offer_find( $email ) {
	$found = get_posts(
		array(
			'post_type'      => AMBROSIA_OFFER_CPT,
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'meta_key'       => '_amb_email',
			'meta_value'     => $email,
		)
	);
	return $found ? (int) $found[0] : 0;
}

/**
 * One coupon per address: single use, locked to the email, 30-day life.
 * Falls back to a plain code string if WooCommerce is not loaded, so the
 * popup still completes rather than erroring in front of the visitor.
 */
function ambrosia_offer_mint( $email ) {

	$code = 'WELCOME' . AMBROSIA_OFFER_PERCENT . '-' . strtoupper( wp_generate_password( 4, false, false ) );

	if ( ! class_exists( 'WC_Coupon' ) ) {
		return $code;
	}

	$coupon = new WC_Coupon();
	$coupon->set_code( $code );
	$coupon->set_discount_type( 'percent' );
	$coupon->set_amount( AMBROSIA_OFFER_PERCENT );
	$coupon->set_individual_use( true );
	$coupon->set_usage_limit( 1 );
	$coupon->set_usage_limit_per_user( 1 );
	$coupon->set_email_restrictions( array( $email ) );
	$coupon->set_exclude_sale_items( true );
	$coupon->set_date_expires( strtotime( '+' . AMBROSIA_OFFER_DAYS . ' days' ) );
	$coupon->set_description( 'Mystery offer signup — ' . $email );
	$coupon->save();

	return $code;
}

/* ---------------------------------------------------------------------------
 * [VERIFY] Email / affiliate hand-off. Guarded, so an inactive plugin is a
 * no-op. Swap in the real system's call once confirmed.
 * ------------------------------------------------------------------------ */

function ambrosia_offer_push_to_crm( $email, $code, $source ) {

	/* FluentCRM */
	if ( function_exists( 'FluentCrmApi' ) ) {
		FluentCrmApi( 'contacts' )->createOrUpdate(
			array(
				'email'  => $email,
				'status' => 'subscribed',
				'source' => $source ?: 'ambrosia-popup',
				'tags'   => array( 'welcome-offer' ),
			)
		);
	}

	/* Mailchimp for WordPress */
	if ( function_exists( 'mc4wp' ) ) {
		try {
			mc4wp( 'api-v3' )->add_list_member(
				'', /* [VERIFY] Mailchimp audience ID */
				array(
					'email_address' => $email,
					'status'        => 'subscribed',
					'merge_fields'  => array( 'OFFERCODE' => $code ),
				)
			);
		} catch ( Exception $e ) {
			/* Never let a list failure break the popup. */
		}
	}
}

/* ---------------------------------------------------------------------------
 * Admin list columns
 * ------------------------------------------------------------------------ */

add_filter( 'manage_' . AMBROSIA_OFFER_CPT . '_posts_columns', function ( $cols ) {
	return array(
		'cb'     => $cols['cb'] ?? '',
		'title'  => 'Email',
		'amb_code'   => 'Code',
		'amb_source' => 'Source',
		'amb_time'   => 'Signed up (UTC)',
	);
} );

add_action( 'manage_' . AMBROSIA_OFFER_CPT . '_posts_custom_column', function ( $col, $id ) {
	$map = array( 'amb_code' => '_amb_code', 'amb_source' => '_amb_source', 'amb_time' => '_amb_time' );
	if ( isset( $map[ $col ] ) ) {
		echo esc_html( get_post_meta( $id, $map[ $col ], true ) );
	}
}, 10, 2 );
