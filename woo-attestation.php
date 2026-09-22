<?php
/**
 * Ambrosia — required attestations above the place order button
 * Snippet name: "Checkout attestations"
 *
 * WPCode: Add Snippet -> Add Your Custom Code (New Snippet) -> PHP Snippet
 *         Insert Method: Auto Insert -> Run Everywhere
 *         Status: Active
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 *
 * Three unticked checkboxes sit directly above the place order button:
 *
 *   1. age      — "I confirm that I am over twenty one years of age."
 *   2. research — "I confirm that these products are for research use only,
 *                  and I agree to the terms of service."  (terms links out,
 *                  new tab)
 *   3. noadmin  — "I confirm that I will not administer these materials to
 *                  any human or animal, and I have read the research-use-only
 *                  labelling."
 *
 * The place order button is disabled, greyed and non-clickable until all three
 * are ticked. Records are retained with the order for at least two years. Both reset unticked on every page load, including back-button /
 * bfcache restores, so a session cannot be resumed with them pre-ticked.
 *
 * Three layers of enforcement, because the front end is only a convenience:
 *   - the button is disabled in the DOM
 *   - clicks are cancelled in the capture phase while either box is unticked
 *   - the Store API route refuses the order if the server has no record of
 *     both attestations for this session
 *
 * ---------------------------------------------------------------------------
 * WHAT IS RECORDED
 *
 * On the order, visible in WooCommerce -> Orders and in an export:
 *
 *   _ambrosia_attestation_age       yes
 *   _ambrosia_attestation_research  yes
 *   _ambrosia_attestation_noadmin   yes
 *   _ambrosia_attestation_time      2026-09-12T14:03:11+00:00  (UTC, ISO 8601)
 *   _ambrosia_attestation_ip        203.0.113.9
 *   _ambrosia_attestation_terms     the exact terms URL shown at the time
 *
 * The timestamp is the moment the second box was ticked, not the moment the
 * order was placed — that is the moment the confirmation was actually made.
 *
 * Works with the block checkout (the one this store uses) and with the classic
 * shortcode checkout as a fallback.
 * ---------------------------------------------------------------------------
 */

/* Terms of Sale on the Vercel storefront. */
if ( ! defined( 'AMBROSIA_TERMS_URL' ) ) {
	define( 'AMBROSIA_TERMS_URL', 'https://www.ambrosiastandard.com/terms-of-sale' );
}

/* ---------------------------------------------------------------------------
 * 1. Front end — markup, styling and gating
 * ------------------------------------------------------------------------ */

add_action( 'wp_enqueue_scripts', function () {

	if ( ! function_exists( 'is_checkout' ) || ! is_checkout() || is_order_received_page() ) {
		return;
	}

	wp_register_script( 'ambrosia-attestation', '', array(), null, true );
	wp_enqueue_script( 'ambrosia-attestation' );

	wp_localize_script(
		'ambrosia-attestation',
		'ambrosiaAttest',
		array(
			'ajax'  => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'ambrosia_attest' ),
			'terms' => AMBROSIA_TERMS_URL,
		)
	);

	wp_add_inline_script( 'ambrosia-attestation', ambrosia_attestation_js() );

	wp_register_style( 'ambrosia-attestation', false, array(), null );
	wp_enqueue_style( 'ambrosia-attestation' );
	wp_add_inline_style( 'ambrosia-attestation', ambrosia_attestation_css() );
} );

/**
 * Styling. Deliberately mirrors the field metrics already in the
 * "Checkout aesthetic" snippet — same 22px square, same brown hairline,
 * same Archivo 14.5px label — so the pair reads as two more checkout fields
 * rather than an appended notice.
 */
function ambrosia_attestation_css() {
	return <<<CSS
.amb-attest {
  display:flex;
  flex-direction:column;
  gap:16px;
  margin:0 0 28px 0;
  padding:22px 0 0 0;
  border-top:1px solid var(--amb-rule, #D8C9B2);
}
.amb-attest__row {
  display:flex;
  align-items:flex-start;
  gap:0;
  cursor:pointer;
}
.amb-attest__box {
  -webkit-appearance:none;
  appearance:none;
  width:22px;
  height:22px;
  min-width:22px;
  margin:0 20px 0 0;
  border:1px solid var(--amb-brown, #7A5622);
  border-radius:0;
  background:#FFFFFF;
  box-sizing:border-box;
  cursor:pointer;
  position:relative;
  flex:0 0 auto;
  transition:border-color 160ms ease;
}
.amb-attest__box:checked { border-color:var(--amb-ox, #6B1F28); }
.amb-attest__box:checked::after {
  content:'';
  position:absolute;
  left:6px;
  top:2px;
  width:7px;
  height:13px;
  border:solid var(--amb-ox, #6B1F28);
  border-width:0 2px 2px 0;
  transform:rotate(45deg);
}
.amb-attest__box:focus-visible {
  outline:2px solid var(--amb-brown, #7A5622);
  outline-offset:2px;
}
.amb-attest__text {
  font-family:'AmbArchivo', system-ui, sans-serif;
  font-size:14.5px;
  line-height:1.5;
  color:var(--amb-ink, #3C312C);
  padding-top:1px;
  text-wrap:pretty;
}
.amb-attest__text a {
  color:var(--amb-ox, #6B1F28);
  text-underline-offset:3px;
  text-decoration-thickness:1px;
}
.amb-attest__text a:hover { color:var(--amb-deep, #3E1218); }

/* Disabled place order button: greyed, flat, inert. */
.amb-attest-locked .wc-block-components-checkout-place-order-button,
.amb-attest-locked #place_order {
  background:var(--amb-rule, #D8C9B2) !important;
  color:#8C8377 !important;
  cursor:not-allowed !important;
  pointer-events:none !important;
  opacity:1 !important;
}
.amb-attest-locked .wc-block-components-checkout-place-order-button:hover,
.amb-attest-locked #place_order:hover {
  background:var(--amb-rule, #D8C9B2) !important;
}

@media (max-width:600px) {
  .amb-attest { gap:18px; margin-bottom:22px; }
  .amb-attest__box { margin-right:16px; }
  .amb-attest__text { font-size:14px; }
}
CSS;
}

/**
 * Injects the pair immediately before the place order button and keeps it
 * there. The block checkout re-renders its actions row on cart, shipping and
 * payment changes, so an observer re-attaches rather than assuming one pass.
 */
function ambrosia_attestation_js() {

	$age      = esc_js( 'I confirm that I am over twenty one years of age.' );
	$research = esc_js( 'I confirm that these products are for research use only, and I agree to the ' );
	$link     = esc_js( 'terms of service' );
	$noadmin  = esc_js( 'I confirm that I will not administer these materials to any human or animal, and I have read the research-use-only labelling.' );

	return <<<JS
( function () {
	var BTN = '.wc-block-components-checkout-place-order-button, #place_order';
	var node = null;

	function build() {
		var wrap = document.createElement( 'div' );
		wrap.className = 'amb-attest';
		wrap.setAttribute( 'data-amb-attest', '1' );

		wrap.appendChild( row( 'amb-attest-age', '{$age}' ) );

		var research = row( 'amb-attest-research', '{$research}' );
		var a = document.createElement( 'a' );
		a.href = ambrosiaAttest.terms;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		a.textContent = '{$link}';
		var text = research.querySelector( '.amb-attest__text' );
		text.appendChild( a );
		text.appendChild( document.createTextNode( '.' ) );
		wrap.appendChild( research );

		wrap.appendChild( row( 'amb-attest-noadmin', '{$noadmin}' ) );

		return wrap;
	}

	function row( id, label ) {
		var l = document.createElement( 'label' );
		l.className = 'amb-attest__row';
		l.setAttribute( 'for', id );

		var box = document.createElement( 'input' );
		box.type = 'checkbox';
		box.id = id;
		box.className = 'amb-attest__box';
		box.checked = false;
		box.required = true;
		box.autocomplete = 'off';
		box.addEventListener( 'change', sync );

		var span = document.createElement( 'span' );
		span.className = 'amb-attest__text';
		span.appendChild( document.createTextNode( label ) );

		l.appendChild( box );
		l.appendChild( span );
		return l;
	}

	function both() {
		var a = document.getElementById( 'amb-attest-age' );
		var b = document.getElementById( 'amb-attest-research' );
		var c = document.getElementById( 'amb-attest-noadmin' );
		return !! ( a && b && c && a.checked && b.checked && c.checked );
	}

	function sync() {
		var ok = both();
		document.body.classList.toggle( 'amb-attest-locked', ! ok );

		document.querySelectorAll( BTN ).forEach( function ( btn ) {
			btn.disabled = ! ok;
			btn.setAttribute( 'aria-disabled', ok ? 'false' : 'true' );
		} );

		if ( ok ) { record(); }
	}

	var recorded = false;
	function record() {
		if ( recorded ) { return; }
		recorded = true;
		var body = new URLSearchParams();
		body.append( 'action', 'ambrosia_attest' );
		body.append( 'nonce', ambrosiaAttest.nonce );
		fetch( ambrosiaAttest.ajax, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		} ).catch( function () { recorded = false; } );
	}

	function place() {
		var btn = document.querySelector( BTN );
		if ( ! btn ) { return; }

		var anchor = btn.closest( '.wc-block-checkout__actions_row' )
			|| btn.closest( '.wc-block-checkout__actions' )
			|| btn.closest( '#place_order' ) && btn.parentNode
			|| btn.parentNode;

		if ( node && node.isConnected && node.nextElementSibling === anchor ) {
			sync();
			return;
		}

		if ( ! node ) { node = build(); }
		anchor.parentNode.insertBefore( node, anchor );
		sync();
	}

	function start() {
		place();
		var host = document.querySelector( '.wc-block-checkout, form.checkout, body' );
		new MutationObserver( function () { place(); } ).observe( host, {
			childList: true,
			subtree: true
		} );

		/* Clicks are cancelled in the capture phase too — a disabled attribute
		   stripped by a re-render should not open a hole. */
		document.addEventListener( 'click', function ( e ) {
			var btn = e.target && e.target.closest && e.target.closest( BTN );
			if ( btn && ! both() ) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		}, true );
	}

	/* Never restore a ticked state: fresh load and bfcache restore both clear. */
	window.addEventListener( 'pageshow', function () {
		[ 'amb-attest-age', 'amb-attest-research', 'amb-attest-noadmin' ].forEach( function ( id ) {
			var el = document.getElementById( id );
			if ( el ) { el.checked = false; }
		} );
		sync();
	} );

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
} )();
JS;
}

/* ---------------------------------------------------------------------------
 * 2. Server — record the confirmation against the session
 * ------------------------------------------------------------------------ */

add_action( 'wp_ajax_ambrosia_attest', 'ambrosia_attestation_capture' );
add_action( 'wp_ajax_nopriv_ambrosia_attest', 'ambrosia_attestation_capture' );

function ambrosia_attestation_capture() {

	check_ajax_referer( 'ambrosia_attest', 'nonce' );

	if ( ! function_exists( 'WC' ) || ! WC()->session ) {
		wp_send_json_error( 'no-session', 400 );
	}

	WC()->session->set(
		'ambrosia_attestation',
		array(
			'age'      => 'yes',
			'research' => 'yes',
			'noadmin'  => 'yes',
			'time'     => gmdate( 'c' ),
			'ip'       => ambrosia_attestation_ip(),
			'terms'    => AMBROSIA_TERMS_URL,
		)
	);

	wp_send_json_success();
}

function ambrosia_attestation_ip() {
	if ( class_exists( 'WC_Geolocation' ) ) {
		return WC_Geolocation::get_ip_address();
	}
	return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
}

function ambrosia_attestation_session() {
	if ( ! function_exists( 'WC' ) || ! WC()->session ) {
		return null;
	}
	$data = WC()->session->get( 'ambrosia_attestation' );
	return ( is_array( $data ) && 'yes' === ( $data['age'] ?? '' ) && 'yes' === ( $data['research'] ?? '' ) && 'yes' === ( $data['noadmin'] ?? '' ) ) ? $data : null;
}

/* ---------------------------------------------------------------------------
 * 3. Server — refuse the order without both, then write the meta
 * ------------------------------------------------------------------------ */

/* Block checkout (Store API). */
add_action( 'woocommerce_store_api_checkout_update_order_from_request', function ( $order ) {

	$data = ambrosia_attestation_session();

	if ( ! $data ) {
		throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException(
			'ambrosia_attestation_required',
			'Please confirm your age and that these products are for research use only.',
			400
		);
	}

	ambrosia_attestation_write( $order, $data );

}, 10, 1 );

/* Classic shortcode checkout. */
add_action( 'woocommerce_after_checkout_validation', function ( $fields, $errors ) {
	if ( ! ambrosia_attestation_session() ) {
		$errors->add( 'ambrosia_attestation', 'Please confirm your age and that these products are for research use only.' );
	}
}, 10, 2 );

add_action( 'woocommerce_checkout_create_order', function ( $order ) {
	$data = ambrosia_attestation_session();
	if ( $data ) {
		ambrosia_attestation_write( $order, $data );
	}
}, 10, 1 );

function ambrosia_attestation_write( $order, $data ) {
	$order->update_meta_data( '_ambrosia_attestation_age', 'yes' );
	$order->update_meta_data( '_ambrosia_attestation_research', 'yes' );
	$order->update_meta_data( '_ambrosia_attestation_noadmin', 'yes' );
	$order->update_meta_data( '_ambrosia_attestation_time', $data['time'] );
	$order->update_meta_data( '_ambrosia_attestation_ip', $data['ip'] );
	$order->update_meta_data( '_ambrosia_attestation_terms', $data['terms'] );
}

/* Clear the session record once the order exists, so the next order in the
   same browser session has to confirm again. */
add_action( 'woocommerce_checkout_order_processed', 'ambrosia_attestation_clear' );
add_action( 'woocommerce_store_api_checkout_order_processed', 'ambrosia_attestation_clear' );

function ambrosia_attestation_clear() {
	if ( function_exists( 'WC' ) && WC()->session ) {
		WC()->session->set( 'ambrosia_attestation', null );
	}
}

/* ---------------------------------------------------------------------------
 * 4. Admin — show it on the order
 * ------------------------------------------------------------------------ */

add_action( 'woocommerce_admin_order_data_after_billing_address', function ( $order ) {

	$time = $order->get_meta( '_ambrosia_attestation_time' );

	if ( ! $time ) {
		echo '<p><strong>Attestations</strong><br><em>Not recorded for this order.</em></p>';
		return;
	}

	printf(
		'<p><strong>Attestations</strong><br>Over 21: yes<br>Research use only + terms: yes<br>No administration to any human or animal + RUO labelling read: yes<br>Confirmed: %s UTC<br>IP: %s</p>',
		esc_html( $time ),
		esc_html( $order->get_meta( '_ambrosia_attestation_ip' ) )
	);
} );
