<?php
if (!defined('ABSPATH')) {
    exit;
}

$ui_type = get_option('cod_verifier_ui_type', 'inline');
$test_mode = get_option('cod_verifier_test_mode', '1');
$allowed_regions = get_option('cod_verifier_allowed_regions', 'india');
$otp_timer_duration = get_option('cod_verifier_otp_timer_duration', 30);
?>

<?php if ($ui_type === 'inline'): ?>
<!-- Inline Mode: Show verification card directly -->
<div id="cod-verifier-wrapper" style="display:none !important; margin: 20px 0; position: relative;">
    <?php include COD_VERIFIER_PLUGIN_PATH . 'templates/cod-verification-template.php'; ?>
</div>
<?php endif; ?>

<!-- Hidden data for JavaScript -->
<script type="text/javascript">
window.codVerifierSettings = {
    allowedRegions: '<?php echo esc_js($allowed_regions); ?>',
    otpTimerDuration: <?php echo intval($otp_timer_duration); ?>,
    testMode: '<?php echo esc_js($test_mode); ?>',
    uiType: '<?php echo esc_js($ui_type); ?>' // NEW: Pass UI type to frontend
};
</script>