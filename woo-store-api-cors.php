<?php
/**
 * Ambrosia — Store API CORS
 *
 * The static site at www.ambrosiastandard.com builds the customer's cart by
 * calling this site's Store API, then hands the customer to /checkout here.
 * Different origin, same registrable domain — so the cart cookie carries, but
 * the browser needs explicit CORS permission (with credentials) to make the
 * calls at all.
 *
 * WPCode: Add Snippet -> Custom Code -> PHP Snippet -> Auto Insert ->
 * Run Everywhere -> Active.
 */

add_action('rest_api_init', function () {
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');

    add_filter('rest_pre_serve_request', function ($value) {
        $allowed = array(
            'https://www.ambrosiastandard.com',
            'https://ambrosiastandard.com',
        );
        $origin = get_http_origin();

        if ($origin && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Nonce, X-WC-Store-API-Nonce, Cart-Token');
            header('Access-Control-Expose-Headers: Nonce, X-WC-Store-API-Nonce, Cart-Token, Link');
            header('Vary: Origin');
        }

        return $value;
    });
}, 15);

/* Answer the browser's preflight before WordPress routes the request. */
add_action('init', function () {
    if (empty($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
        return;
    }
    if (empty($_SERVER['REQUEST_URI']) || strpos($_SERVER['REQUEST_URI'], '/wp-json/') === false) {
        return;
    }

    $allowed = array(
        'https://www.ambrosiastandard.com',
        'https://ambrosiastandard.com',
    );
    $origin = get_http_origin();

    if ($origin && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Nonce, X-WC-Store-API-Nonce, Cart-Token');
        header('Access-Control-Max-Age: 86400');
        status_header(204);
        exit;
    }
}, 1);
