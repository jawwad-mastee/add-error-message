<?php
if (!defined('ABSPATH')) {
    exit;
}

$enable_otp = get_option('cod_verifier_enable_otp', '1');
$test_mode = get_option('cod_verifier_test_mode', '1');
$allowed_regions = get_option('cod_verifier_allowed_regions', 'india');
$otp_timer_duration = get_option('cod_verifier_otp_timer_duration', 30);
?>

<div class="cod-verifier-container">
    <!-- Header -->
    <div class="cod-verifier-header">
        <div class="cod-header-content">
            <div class="cod-icon">🔐</div>
            <div class="cod-header-text">
                <h3>COD Verification Required</h3>
                <p>Complete verification to place your Cash on Delivery order</p>
            </div>
        </div>
        <?php if ($test_mode === '1'): ?>
        <div class="cod-test-badge">TEST MODE</div>
        <?php endif; ?>
    </div>
    
    <!-- Content -->
    <div class="cod-verifier-content">
        <div id="cod-inline-validation-error" class="cod-message error" style="display: none; margin-bottom: 15px;"></div>
        <?php if ($enable_otp === '1'): ?>
        <div class="cod-section" id="cod-verifier-otp-section">
            <div class="cod-section-header">
                <span class="cod-section-icon">📱</span>
                <h4>Phone Verification</h4>
                <span class="cod-step-badge">Step 1</span>
            </div>
            
            <div class="cod-form-group">
                <label for="cod_phone">Mobile Number</label>
                <div class="cod-input-group cod-phone-input-group">
                    <!-- Country Code Dropdown -->
                    <select id="cod_country_code" name="cod_country_code" class="cod-country-select">
                        <?php if ($allowed_regions === 'global' || $allowed_regions === 'india'): ?>
                        <option value="+91" selected>🇮🇳 +91</option>
                        <?php endif; ?>
                        <?php if ($allowed_regions === 'global' || $allowed_regions === 'usa'): ?>
                        <option value="+1">🇺🇸 +1</option>
                        <?php endif; ?>
                        <?php if ($allowed_regions === 'global' || $allowed_regions === 'uk'): ?>
                        <option value="+44">🇬🇧 +44</option>
                        <?php endif; ?>
                    </select>
                    
                    <!-- Phone Number Input -->
                    <input type="tel" id="cod_phone" name="cod_phone" placeholder="Enter phone number" class="cod-input cod-phone-input">
                    
                    <!-- Send OTP Button -->
                    <button type="button" id="cod_send_otp" class="cod-btn cod-btn-primary cod-send-otp-btn">Send OTP</button>
                </div>
                <div class="cod-phone-help">
                    <small id="cod_phone_help_text">
                        <?php if ($allowed_regions === 'india'): ?>
                            Enter 10-digit Indian mobile number (e.g., 7039940998)
                        <?php elseif ($allowed_regions === 'usa'): ?>
                            Enter 10-digit US phone number (e.g., 2125551234)
                        <?php elseif ($allowed_regions === 'uk'): ?>
                            Enter UK phone number (e.g., 7700900123)
                        <?php else: ?>
                            Select country and enter phone number
                        <?php endif; ?>
                    </small>
                </div>
            </div>
            
            <div class="cod-form-group">
                <label for="cod_otp">Enter OTP</label>
                <div class="cod-input-group">
                    <input type="text" id="cod_otp" name="cod_otp" placeholder="6-digit OTP" maxlength="6" class="cod-input">
                    <button type="button" id="cod_verify_otp" class="cod-btn cod-btn-success" disabled>Verify</button>
                </div>
            </div>
            
            <div id="cod_otp_message" class="cod-message"></div>
        </div>
        <?php endif; ?>
        
        <!-- Status Summary -->
        <div class="cod-status-summary">
            <h4>Verification Status</h4>
            <div class="cod-status-items">
                <?php if ($enable_otp === '1'): ?>
                <div class="cod-status-item" id="cod-otp-status">
                    <span class="cod-status-icon">📱</span>
                    <span class="cod-status-text">Phone Verification</span>
                    <span class="cod-status-badge pending" id="cod-otp-badge">Pending</span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>