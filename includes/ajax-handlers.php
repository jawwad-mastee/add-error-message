<?php
if (!defined('ABSPATH')) {
    exit;
}

class CODVerifierAjax {
    
    public function __construct() {
        add_action('wp_ajax_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_nopriv_cod_send_otp', array($this, 'send_otp'));
        add_action('wp_ajax_cod_verify_otp', array($this, 'verify_otp'));
        add_action('wp_ajax_nopriv_cod_verify_otp', array($this, 'verify_otp'));
    }
    
    public function send_otp() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        // Get phone data - support both old and new format
        $phone = sanitize_text_field($_POST['phone']); // Full E.164 format
        $country_code = isset($_POST['country_code']) ? sanitize_text_field($_POST['country_code']) : '';
        $phone_number = isset($_POST['phone_number']) ? sanitize_text_field($_POST['phone_number']) : '';
        
        // Validate allowed regions
        $allowed_regions = get_option('cod_verifier_allowed_regions', 'india');
        $region_validation = $this->validate_phone_region($phone, $allowed_regions);
        
        if (!$region_validation['valid']) {
            wp_send_json_error($region_validation['message']);
            return;
        }
        
        // Enhanced phone validation
        $phone_validation = $this->validate_phone_number($phone, $country_code, $phone_number);
        if (!$phone_validation['valid']) {
            wp_send_json_error($phone_validation['message']);
            return;
        }
        
        $test_mode = get_option('cod_verifier_test_mode', '1');
        
        if (!session_id()) {
            session_start();
        }
        
        // Check cooldown period (prevent spam)
        $cooldown_duration = get_option('cod_verifier_otp_timer_duration', 30);
        if (isset($_SESSION['cod_otp_time']) && (time() - $_SESSION['cod_otp_time'] < $cooldown_duration)) {
            $remaining = $cooldown_duration - (time() - $_SESSION['cod_otp_time']);
            wp_send_json_error(sprintf(__('Please wait %d seconds before resending OTP.', 'cod-verifier'), $remaining));
            return;
        }

        // Generate OTP
        $otp = sprintf('%06d', rand(100000, 999999));
        $_SESSION['cod_otp'] = $otp;
        $_SESSION['cod_otp_phone'] = $phone;
        $_SESSION['cod_otp_time'] = time();
        $_SESSION['cod_otp_verified'] = false;
        
        if ($test_mode === '1') {
            // Test mode - return OTP in response
            wp_send_json_success(array(
                'message' => __('OTP sent successfully! (Test Mode)', 'cod-verifier'),
                'otp' => $otp,
                'test_mode' => true
            ));
        } else {
            // Production mode - send actual SMS via Twilio
            $result = $this->send_twilio_sms($phone, $otp);
            
            if ($result['success']) {
                wp_send_json_success(array(
                    'message' => __('OTP sent successfully to your mobile number!', 'cod-verifier')
                ));
            } else {
                wp_send_json_error($result['message']);
            }
        }
    }
    
    /**
     * Validate phone number against allowed regions
     */
    private function validate_phone_region($phone, $allowed_regions) {
        // Extract country code from phone number
        $country_code = '';
        if (strpos($phone, '+91') === 0) {
            $country_code = '+91';
        } elseif (strpos($phone, '+1') === 0) {
            $country_code = '+1';
        } elseif (strpos($phone, '+44') === 0) {
            $country_code = '+44';
        } else {
            return array(
                'valid' => false,
                'message' => __('Invalid phone number format. Please include country code.', 'cod-verifier')
            );
        }
        
        // Check against allowed regions
        switch ($allowed_regions) {
            case 'india':
                if ($country_code !== '+91') {
                    return array(
                        'valid' => false,
                        'message' => __('Only Indian phone numbers (+91) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'usa':
                if ($country_code !== '+1') {
                    return array(
                        'valid' => false,
                        'message' => __('Only US phone numbers (+1) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'uk':
                if ($country_code !== '+44') {
                    return array(
                        'valid' => false,
                        'message' => __('Only UK phone numbers (+44) are allowed.', 'cod-verifier')
                    );
                }
                break;
                
            case 'global':
                // All supported countries are allowed
                if (!in_array($country_code, ['+91', '+1', '+44'])) {
                    return array(
                        'valid' => false,
                        'message' => __('Unsupported country code. Supported: +91 (India), +1 (USA), +44 (UK).', 'cod-verifier')
                    );
                }
                break;
                
            default:
                return array(
                    'valid' => false,
                    'message' => __('Invalid region configuration.', 'cod-verifier')
                );
        }
        
        return array('valid' => true, 'message' => 'Valid region');
    }
    
    /**
     * Enhanced phone number validation for multiple countries
     */
    private function validate_phone_number($phone, $country_code = '', $phone_number = '') {
        // Validation rules for each country
        $validation_rules = array(
            '+91' => array(
                'pattern' => '/^\+91[6-9]\d{9}$/',
                'name' => 'Indian',
                'example' => '+917039940998'
            ),
            '+1' => array(
                'pattern' => '/^\+1[2-9]\d{9}$/',
                'name' => 'US',
                'example' => '+12125551234'
            ),
            '+44' => array(
                'pattern' => '/^\+447\d{9}$/',
                'name' => 'UK',
                'example' => '+447700900123'
            )
        );
        
        // Determine country code from phone number
        $detected_country = '';
        foreach ($validation_rules as $code => $rule) {
            if (strpos($phone, $code) === 0) {
                $detected_country = $code;
                break;
            }
        }
        
        if (empty($detected_country)) {
            return array(
                'valid' => false,
                'message' => __('Invalid phone number format. Supported formats: +91 (India), +1 (USA), +44 (UK).', 'cod-verifier')
            );
        }
        
        $rule = $validation_rules[$detected_country];
        
        if (!preg_match($rule['pattern'], $phone)) {
            return array(
                'valid' => false,
                'message' => sprintf(
                    __('Please enter a valid %s phone number (e.g., %s).', 'cod-verifier'),
                    $rule['name'],
                    $rule['example']
                )
            );
        }
        
        return array('valid' => true, 'message' => 'Valid phone number');
    }
    
    private function send_twilio_sms($phone, $otp) {
        try {
            // Get Twilio settings
            $sid = get_option('cod_verifier_twilio_sid', '');
            $token = get_option('cod_verifier_twilio_token', '');
            $twilio_number = get_option('cod_verifier_twilio_number', '');
            
            if (empty($sid) || empty($token) || empty($twilio_number)) {
                return array(
                    'success' => false,
                    'message' => __('Twilio SMS service not configured. Please contact administrator.', 'cod-verifier')
                );
            }
            
            // Load Twilio SDK
            $twilio_autoload = COD_VERIFIER_PLUGIN_PATH . 'includes/twilio-sdk/src/Twilio/autoload.php';
            
            if (!file_exists($twilio_autoload)) {
                error_log('COD Verifier: Twilio SDK not found at ' . $twilio_autoload);
                return array(
                    'success' => false,
                    'message' => __('SMS service temporarily unavailable. Please try again later.', 'cod-verifier')
                );
            }
            
            require_once $twilio_autoload;
            
            // Phone number is already in E.164 format from frontend validation
            $formatted_phone = $phone;
            
            // Final validation for E.164 format
            if (!preg_match('/^\+\d{10,15}$/', $formatted_phone)) {
                return array(
                    'success' => false,
                    'message' => __('Invalid phone number format for SMS delivery.', 'cod-verifier')
                );
            }

            // Create Twilio client
            $client = new \Twilio\Rest\Client($sid, $token);
            
            // Customize message based on country
            $country_name = 'your';
            if (strpos($phone, '+91') === 0) {
                $country_name = 'Indian';
            } elseif (strpos($phone, '+1') === 0) {
                $country_name = 'US';
            } elseif (strpos($phone, '+44') === 0) {
                $country_name = 'UK';
            }
            
            $message = "Your COD verification OTP is: {$otp}. Valid for 5 minutes. Do not share this code. - COD Verifier";
            
            // Send SMS
            $result = $client->messages->create(
                $formatted_phone,
                array(
                    'from' => $twilio_number,
                    'body' => $message
                )
            );
            
            if ($result->sid) {
                error_log('COD Verifier: SMS sent successfully to ' . $formatted_phone . '. SID: ' . $result->sid);
                return array(
                    'success' => true,
                    'message' => sprintf(__('OTP sent successfully to your %s number!', 'cod-verifier'), $country_name)
                );
            } else {
                error_log('COD Verifier: SMS sending failed - no SID returned');
                return array(
                    'success' => false,
                    'message' => __('Failed to send OTP. Please try again.', 'cod-verifier')
                );
            }
            
        } catch (\Twilio\Exceptions\RestException $e) {
            error_log('COD Verifier: Twilio REST Exception: ' . $e->getMessage());
            
            // Provide user-friendly error messages
            $error_code = $e->getCode();
            switch ($error_code) {
                case 21211:
                    $user_message = __('Invalid phone number. Please check and try again.', 'cod-verifier');
                    break;
                case 21408:
                    $user_message = __('SMS not supported for this number. Please try a different number.', 'cod-verifier');
                    break;
                case 21614:
                    $user_message = __('Invalid sender number configuration. Please contact support.', 'cod-verifier');
                    break;
                default:
                    $user_message = __('SMS service error. Please check your phone number and try again.', 'cod-verifier');
            }
            
            return array(
                'success' => false,
                'message' => $user_message
            );
        } catch (Exception $e) {
            error_log('COD Verifier: General Exception: ' . $e->getMessage());
            return array(
                'success' => false,
                'message' => __('Failed to send OTP. Please try again later.', 'cod-verifier')
            );
        }
    }
    
    public function verify_otp() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'cod_verifier_nonce')) {
            wp_send_json_error(__('Security check failed.', 'cod-verifier'));
            return;
        }
        
        $otp = sanitize_text_field($_POST['otp']);
        
        if (!session_id()) {
            session_start();
        }
        
        $stored_otp = isset($_SESSION['cod_otp']) ? $_SESSION['cod_otp'] : '';
        $otp_time = isset($_SESSION['cod_otp_time']) ? $_SESSION['cod_otp_time'] : 0;
        
        if (empty($stored_otp)) {
            wp_send_json_error(__('No OTP found. Please request a new OTP.', 'cod-verifier'));
            return;
        }
        
        // Check if OTP is expired (5 minutes)
        if (time() - $otp_time > 300) {
            unset($_SESSION['cod_otp']);
            wp_send_json_error(__('OTP expired. Please request a new OTP.', 'cod-verifier'));
            return;
        }
        
        if ($otp === $stored_otp) {
            $_SESSION['cod_otp_verified'] = true;
            wp_send_json_success(__('OTP verified successfully!', 'cod-verifier'));
        } else {
            wp_send_json_error(__('Invalid OTP. Please try again.', 'cod-verifier'));
        }
    }
}

new CODVerifierAjax();
?>