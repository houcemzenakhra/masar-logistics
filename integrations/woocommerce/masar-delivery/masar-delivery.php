<?php
/**
 * Plugin Name: Masar Delivery
 * Description: Sends WooCommerce orders to Masar for delivery across Algeria, and updates each order as the parcel moves.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * Author: Masar
 * License: GPL-2.0-or-later
 * Text Domain: masar-delivery
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Masar_Delivery
{
    const OPT = 'masar_delivery';
    const META_TRACKING = '_masar_tracking';
    const META_PARCEL = '_masar_parcel_id';
    const META_STATUS = '_masar_status';

    public static function init()
    {
        add_action('before_woocommerce_init', function () {
            // Works with WooCommerce's order tables (HPOS): orders are read and written through WC_Order only.
            if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
            }
        });
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_filter('woocommerce_order_actions', [__CLASS__, 'order_action']);
        add_action('woocommerce_order_action_masar_send', [__CLASS__, 'send_from_action']);
        add_filter('bulk_actions-edit-shop_order', [__CLASS__, 'bulk_action']);
        add_filter('bulk_actions-woocommerce_page_wc-orders', [__CLASS__, 'bulk_action']);
        add_filter('handle_bulk_actions-edit-shop_order', [__CLASS__, 'handle_bulk'], 10, 3);
        add_filter('handle_bulk_actions-woocommerce_page_wc-orders', [__CLASS__, 'handle_bulk'], 10, 3);
        add_action('woocommerce_order_status_processing', [__CLASS__, 'maybe_auto_send']);
        add_action('rest_api_init', [__CLASS__, 'routes']);
        add_action('woocommerce_order_details_after_order_table', [__CLASS__, 'show_tracking']);
        add_action('woocommerce_email_after_order_table', [__CLASS__, 'show_tracking']);
        add_action('admin_notices', [__CLASS__, 'notices']);
    }

    // ---------- settings ----------

    public static function opt($key, $default = '')
    {
        $o = get_option(self::OPT, []);
        return isset($o[$key]) && $o[$key] !== '' ? $o[$key] : $default;
    }

    public static function menu()
    {
        add_submenu_page('woocommerce', 'Masar', 'Masar', 'manage_woocommerce', 'masar-delivery', [__CLASS__, 'settings_page']);
    }

    public static function register_settings()
    {
        register_setting('masar_delivery', self::OPT, ['sanitize_callback' => [__CLASS__, 'sanitize']]);
    }

    public static function sanitize($in)
    {
        $out = [];
        $out['base_url'] = esc_url_raw(rtrim(trim($in['base_url'] ?? ''), '/'));
        $out['api_key'] = sanitize_text_field($in['api_key'] ?? '');
        $out['webhook_secret'] = sanitize_text_field($in['webhook_secret'] ?? '');
        $out['auto_send'] = empty($in['auto_send']) ? '' : '1';
        $out['complete_on_delivery'] = empty($in['complete_on_delivery']) ? '' : '1';
        $out['sms_lang'] = in_array($in['sms_lang'] ?? 'fr', ['fr', 'ar'], true) ? $in['sms_lang'] : 'fr';
        $out['weight'] = max(1, (int) ($in['weight'] ?? 1));
        $out['allow_partial'] = empty($in['allow_partial']) ? '' : '1';
        return $out;
    }

    public static function settings_page()
    {
        $o = get_option(self::OPT, []);
        $hook = rest_url('masar/v1/webhook');
        $v = function ($k, $d = '') use ($o) {
            return esc_attr($o[$k] ?? $d);
        };
        ?>
        <div class="wrap">
            <h1>Masar</h1>
            <p><?php echo esc_html__('Create an API key in your Masar merchant space (Integrations), paste it here, then add the webhook address below in Masar so orders update themselves.', 'masar-delivery'); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('masar_delivery'); ?>
                <table class="form-table" role="presentation">
                    <tr><th><label for="masar_base"><?php esc_html_e('Masar address', 'masar-delivery'); ?></label></th>
                        <td><input id="masar_base" class="regular-text" name="<?php echo self::OPT; ?>[base_url]" value="<?php echo $v('base_url'); ?>" placeholder="https://masar.example.dz" required></td></tr>
                    <tr><th><label for="masar_key"><?php esc_html_e('API key', 'masar-delivery'); ?></label></th>
                        <td><input id="masar_key" class="regular-text code" type="password" autocomplete="off" name="<?php echo self::OPT; ?>[api_key]" value="<?php echo $v('api_key'); ?>" placeholder="msr_live_…" required></td></tr>
                    <tr><th><?php esc_html_e('Webhook address', 'masar-delivery'); ?></th>
                        <td><code><?php echo esc_html($hook); ?></code><p class="description"><?php esc_html_e('Add it in Masar under Integrations > Webhooks, then paste the signing secret Masar shows you here.', 'masar-delivery'); ?></p></td></tr>
                    <tr><th><label for="masar_secret"><?php esc_html_e('Webhook signing secret', 'masar-delivery'); ?></label></th>
                        <td><input id="masar_secret" class="regular-text code" type="password" autocomplete="off" name="<?php echo self::OPT; ?>[webhook_secret]" value="<?php echo $v('webhook_secret'); ?>" placeholder="whsec_…"></td></tr>
                    <tr><th><?php esc_html_e('Sending', 'masar-delivery'); ?></th>
                        <td><label><input type="checkbox" name="<?php echo self::OPT; ?>[auto_send]" value="1" <?php checked($v('auto_send'), '1'); ?>> <?php esc_html_e('Send each order to Masar when it becomes "Processing"', 'masar-delivery'); ?></label><br>
                            <label><input type="checkbox" name="<?php echo self::OPT; ?>[complete_on_delivery]" value="1" <?php checked($v('complete_on_delivery', '1'), '1'); ?>> <?php esc_html_e('Mark the order "Completed" when Masar delivers it', 'masar-delivery'); ?></label><br>
                            <label><input type="checkbox" name="<?php echo self::OPT; ?>[allow_partial]" value="1" <?php checked($v('allow_partial'), '1'); ?>> <?php esc_html_e('Let customers keep only part of an order (partial delivery)', 'masar-delivery'); ?></label></td></tr>
                    <tr><th><label for="masar_lang"><?php esc_html_e('Text messages to customers in', 'masar-delivery'); ?></label></th>
                        <td><select id="masar_lang" name="<?php echo self::OPT; ?>[sms_lang]"><option value="fr" <?php selected($v('sms_lang', 'fr'), 'fr'); ?>>Français</option><option value="ar" <?php selected($v('sms_lang'), 'ar'); ?>>العربية</option></select></td></tr>
                    <tr><th><label for="masar_weight"><?php esc_html_e('Weight when a product has none (kg)', 'masar-delivery'); ?></label></th>
                        <td><input id="masar_weight" type="number" min="1" max="70" name="<?php echo self::OPT; ?>[weight]" value="<?php echo $v('weight', '1'); ?>"></td></tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    // ---------- sending orders ----------

    public static function order_action($actions)
    {
        $actions['masar_send'] = __('Send to Masar', 'masar-delivery');
        return $actions;
    }

    public static function bulk_action($actions)
    {
        $actions['masar_send'] = __('Send to Masar', 'masar-delivery');
        return $actions;
    }

    public static function handle_bulk($redirect, $action, $ids)
    {
        if ($action !== 'masar_send') {
            return $redirect;
        }
        $ok = 0;
        $failed = 0;
        foreach ($ids as $id) {
            $order = wc_get_order($id);
            if ($order && self::send($order) === true) {
                $ok++;
            } else {
                $failed++;
            }
        }
        return add_query_arg(['masar_sent' => $ok, 'masar_failed' => $failed], $redirect);
    }

    public static function send_from_action($order)
    {
        self::send($order);
    }

    public static function maybe_auto_send($order_id)
    {
        if (self::opt('auto_send') !== '1') {
            return;
        }
        $order = wc_get_order($order_id);
        if ($order) {
            self::send($order);
        }
    }

    /** The wilaya number from WooCommerce's Algerian state code ("DZ-16") or a plain number. */
    public static function wilaya_id($state)
    {
        if (preg_match('/(\d{1,2})$/', (string) $state, $m)) {
            $n = (int) $m[1];
            return $n >= 1 && $n <= 69 ? $n : null;
        }
        return null;
    }

    /** Builds the Masar order from a WooCommerce order. */
    public static function payload(WC_Order $order)
    {
        $ship = $order->has_shipping_address();
        $first = $ship ? $order->get_shipping_first_name() : $order->get_billing_first_name();
        $last = $ship ? $order->get_shipping_last_name() : $order->get_billing_last_name();
        $state = $ship ? $order->get_shipping_state() : $order->get_billing_state();
        $city = $ship ? $order->get_shipping_city() : $order->get_billing_city();
        $addr = array_filter([$ship ? $order->get_shipping_address_1() : $order->get_billing_address_1(), $ship ? $order->get_shipping_address_2() : $order->get_billing_address_2()]);
        $phone = method_exists($order, 'get_shipping_phone') && $order->get_shipping_phone() ? $order->get_shipping_phone() : $order->get_billing_phone();

        $items = [];
        $weight = 0.0;
        foreach ($order->get_items() as $item) {
            $qty = (int) $item->get_quantity();
            $items[] = ($qty > 1 ? $qty . ' × ' : '') . $item->get_name();
            $product = $item->get_product();
            if ($product && $product->get_weight()) {
                $weight += (float) wc_get_weight((float) $product->get_weight(), 'kg') * $qty;
            }
        }
        $cod = $order->get_payment_method() === 'cod' ? (int) round((float) $order->get_total()) : 0;

        return array_filter([
            'externalRef' => (string) $order->get_order_number(),
            'recipientName' => trim($first . ' ' . $last),
            'recipientPhone' => $phone,
            'recipientLang' => self::opt('sms_lang', 'fr'),
            'destWilayaId' => self::wilaya_id($state),
            'commune' => $city,
            'address' => implode(', ', $addr),
            'description' => mb_substr(implode('; ', $items), 0, 120),
            'weightKg' => max(1, $weight > 0 ? (float) ceil($weight) : (int) self::opt('weight', 1)),
            'codAmount' => $cod,
            'allowPartial' => self::opt('allow_partial') === '1' ? true : null,
        ], function ($v) {
            return $v !== null && $v !== '';
        });
    }

    /** Sends one order. Returns true, or the reason it was not sent (also added as an order note). */
    public static function send(WC_Order $order)
    {
        if ($order->get_meta(self::META_TRACKING)) {
            return true;
        }
        $base = self::opt('base_url');
        $key = self::opt('api_key');
        if (!$base || !$key) {
            $order->add_order_note(__('Masar: add the Masar address and API key under WooCommerce > Masar first.', 'masar-delivery'));
            return 'settings';
        }
        $body = self::payload($order);
        if (empty($body['destWilayaId'])) {
            $order->add_order_note(__('Masar: not sent. Choose the customer\'s wilaya (state) on the order, then send again.', 'masar-delivery'));
            return 'wilaya';
        }
        $res = wp_remote_post($base . '/api/v1/parcels', [
            'timeout' => 15,
            'headers' => ['Authorization' => 'Bearer ' . $key, 'Content-Type' => 'application/json'],
            'body' => wp_json_encode($body),
        ]);
        if (is_wp_error($res)) {
            $order->add_order_note(sprintf(__('Masar: could not connect (%s). Try again.', 'masar-delivery'), $res->get_error_message()));
            return 'network';
        }
        $code = wp_remote_retrieve_response_code($res);
        $data = json_decode(wp_remote_retrieve_body($res), true);
        // 409: this order was sent before (perhaps by another click). Keep its tracking number.
        if ($code === 201 || ($code === 409 && !empty($data['tracking']))) {
            $tracking = $code === 201 ? $data['parcel']['tracking'] : $data['tracking'];
            $order->update_meta_data(self::META_TRACKING, $tracking);
            if ($code === 201) {
                $order->update_meta_data(self::META_PARCEL, $data['parcel']['id']);
                $order->update_meta_data(self::META_STATUS, $data['parcel']['status']);
            }
            $order->save();
            $order->add_order_note(sprintf(__('Masar: sent as %1$s. Follow it at %2$s', 'masar-delivery'), $tracking, self::tracking_url($tracking)));
            return true;
        }
        $why = is_array($data) && !empty($data['error']) ? $data['error'] : 'HTTP ' . $code;
        $order->add_order_note(sprintf(__('Masar: not sent: %s', 'masar-delivery'), $why));
        return 'refused';
    }

    public static function tracking_url($tracking)
    {
        return self::opt('base_url') . '/t/' . rawurlencode($tracking);
    }

    public static function show_tracking($order)
    {
        $tracking = $order instanceof WC_Order ? $order->get_meta(self::META_TRACKING) : '';
        if (!$tracking) {
            return;
        }
        printf('<p><strong>%s</strong> <a href="%s">%s</a></p>', esc_html__('Delivery by Masar:', 'masar-delivery'), esc_url(self::tracking_url($tracking)), esc_html($tracking));
    }

    public static function notices()
    {
        if (!isset($_GET['masar_sent'])) {
            return;
        }
        $ok = (int) $_GET['masar_sent'];
        $failed = (int) ($_GET['masar_failed'] ?? 0);
        printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', $failed ? 'warning' : 'success', esc_html(sprintf(__('Masar: %1$d sent, %2$d not sent (see the order notes).', 'masar-delivery'), $ok, $failed)));
    }

    // ---------- hearing back ----------

    public static function routes()
    {
        register_rest_route('masar/v1', '/webhook', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'webhook'],
            // Anyone may call it; only requests signed with the secret are acted on.
            'permission_callback' => '__return_true',
        ]);
    }

    /** Checks `Masar-Signature: t=…,v1=…` (HMAC-SHA256 of "t.body"), at most five minutes old. */
    public static function verify($secret, $body, $header)
    {
        $parts = [];
        foreach (explode(',', (string) $header) as $p) {
            $kv = explode('=', $p, 2);
            if (count($kv) === 2) {
                $parts[trim($kv[0])] = trim($kv[1]);
            }
        }
        if (empty($parts['t']) || empty($parts['v1']) || abs(time() - (int) $parts['t']) > 300) {
            return false;
        }
        return hash_equals(hash_hmac('sha256', $parts['t'] . '.' . $body, $secret), $parts['v1']);
    }

    const STATUS_TEXT = [
        'pickup_assigned' => 'courier on the way to pick it up',
        'picked_up' => 'picked up',
        'at_origin_hub' => 'at the hub',
        'in_transit' => 'on its way to the destination hub',
        'at_destination_hub' => 'at the destination hub',
        'out_for_delivery' => 'out for delivery',
        'ready_for_pickup' => 'ready at the stop desk',
        'delivered' => 'delivered',
        'attempt_failed' => 'delivery attempt failed',
        'return_initiated' => 'coming back to you',
        'returned' => 'returned to you',
        'cancelled' => 'cancelled',
        'lost' => 'lost',
    ];

    public static function webhook(WP_REST_Request $req)
    {
        $secret = self::opt('webhook_secret');
        $body = $req->get_body();
        if (!$secret || !self::verify($secret, $body, $req->get_header('masar_signature'))) {
            return new WP_REST_Response(['error' => 'bad signature'], 401);
        }
        $event = json_decode($body, true);
        $p = $event['data']['parcel'] ?? null;
        if (!empty($event['test'])) {
            return new WP_REST_Response(['ok' => true, 'test' => true], 200);
        }
        if (!$p || empty($p['externalRef'])) {
            return new WP_REST_Response(['ok' => true, 'ignored' => 'no order number'], 200);
        }
        $order = self::find_order($p['externalRef']);
        if (!$order || ($order->get_meta(self::META_TRACKING) && $order->get_meta(self::META_TRACKING) !== $p['tracking'])) {
            // A return parcel or another shop's order number: answered so it is not retried.
            return new WP_REST_Response(['ok' => true, 'ignored' => 'unknown order'], 200);
        }
        $order->update_meta_data(self::META_STATUS, $p['status']);
        if (!$order->get_meta(self::META_TRACKING)) {
            $order->update_meta_data(self::META_TRACKING, $p['tracking']);
            $order->update_meta_data(self::META_PARCEL, $p['id']);
        }
        $order->save();
        if (($event['event'] ?? '') === 'parcel.status_changed') {
            $text = self::STATUS_TEXT[$p['status']] ?? $p['status'];
            if ($p['status'] === 'delivered' && isset($p['collectedAmount']) && $p['collectedAmount'] !== null) {
                $text .= sprintf(' (partial: %s DZD collected)', $p['collectedAmount']);
            }
            $order->add_order_note(sprintf(__('Masar %1$s: %2$s', 'masar-delivery'), $p['tracking'], $text));
            if ($p['status'] === 'delivered' && self::opt('complete_on_delivery', '1') === '1' && !$order->has_status('completed')) {
                $order->update_status('completed', __('Delivered by Masar.', 'masar-delivery'));
            }
        }
        return new WP_REST_Response(['ok' => true], 200);
    }

    public static function find_order($number)
    {
        $order = wc_get_order((int) $number);
        if ($order && (string) $order->get_order_number() === (string) $number) {
            return $order;
        }
        // Shops that renumber orders (sequential order number plugins).
        $found = wc_get_orders(['limit' => 1, 'meta_key' => '_order_number', 'meta_value' => $number]);
        return $found ? $found[0] : null;
    }
}

Masar_Delivery::init();
