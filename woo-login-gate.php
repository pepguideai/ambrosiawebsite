<?php
/**
 * Ambrosia login gate for the WordPress host (admin.ambrosiastandard.com).
 * Add as a WPCode snippet: type PHP, "Run everywhere", Active.
 *
 * The storefront at www.ambrosiastandard.com is gated by middleware.js. This
 * closes the back door: WooCommerce's own shop/product pages and the public
 * product APIs on the WordPress host. A request passes if it carries a valid
 * amb_session cookie (sent through the www proxy) or comes from a logged-in
 * shop manager. Cart and checkout are untouched.
 *
 * AMBROSIA_SESSION_SECRET must equal SESSION_SECRET in Vercel.
 */
if (!defined('AMBROSIA_SESSION_SECRET')) {
    define('AMBROSIA_SESSION_SECRET', '5e4d2d41bdad79518be12762dae256356c57c749272fc0fd5dbe4779539731c5');
}

function ambrosia_gate_ok() {
    if (is_user_logged_in() && current_user_can('edit_products')) return true;
    $t = isset($_COOKIE['amb_session']) ? (string) $_COOKIE['amb_session'] : '';
    $i = strrpos($t, '.');
    if ($i === false || $i < 1) return false;
    $body = substr($t, 0, $i);
    $sig  = substr($t, $i + 1);
    $want = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, AMBROSIA_SESSION_SECRET, true)), '+/', '-_'), '=');
    if (!hash_equals($want, $sig)) return false;
    $p = json_decode(base64_decode(strtr($body, '-_', '+/')), true);
    return is_array($p) && !empty($p['exp']) && (int) $p['exp'] > time();
}

add_action('template_redirect', function () {
    if (is_admin() || !function_exists('is_shop')) return;
    $catalog = is_shop() || is_product() || is_product_taxonomy()
        || (is_feed() && get_query_var('post_type') === 'product')
        || (is_search() && get_query_var('post_type') === 'product');
    if ($catalog && !ambrosia_gate_ok()) {
        wp_redirect('https://www.ambrosiastandard.com/login', 302);
        exit;
    }
}, 1);

add_filter('rest_pre_dispatch', function ($result, $server, $request) {
    $route = $request->get_route();
    $catalog = preg_match('#^/wc/store(/v\d+)?/products#', $route)
        || preg_match('#^/wp/v2/(product|product_cat|product_tag)\b#', $route);
    if ($catalog && !ambrosia_gate_ok()) {
        return new WP_Error('ambrosia_login_required', 'Sign in required.', array('status' => 401));
    }
    return $result;
}, 10, 3);

/* Keep products out of the WordPress sitemap. */
add_filter('wp_sitemaps_post_types', function ($types) { unset($types['product']); return $types; });
add_filter('wp_sitemaps_taxonomies', function ($t) { unset($t['product_cat'], $t['product_tag']); return $t; });
