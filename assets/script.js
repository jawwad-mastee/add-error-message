jQuery(document).ready(function($) {
    'use strict';
    
    console.log('COD Verifier: Multi-country script with UI modes initialized');
    
    // Check if codVerifier is defined
    if (typeof codVerifier === 'undefined') {
        console.error('COD Verifier: codVerifier object not found.');
        return;
    }
    
    // Get settings from global variable
    const settings = window.codVerifierSettings || {
        allowedRegions: 'india',
        otpTimerDuration: 30,
        testMode: '1',
        uiType: 'inline' // NEW: UI type setting
    };
    
    // Global verification state
    window.codVerifierStatus = {
      otpVerified: false,
      tokenVerified: false
    };
    
    let isBlockCheckout = $('.wc-block-checkout').length > 0;
    let verificationBoxCreated = false;
    let warningMessageCreated = false;
    let completeVerificationBtnCreated = false; // NEW: Track complete verification button
    let otpTimer = null;
    let tokenTimer = null;
    
    console.log('COD Verifier: Checkout type:', isBlockCheckout ? 'Blocks' : 'Classic');
    console.log('COD Verifier: Settings:', settings);
    console.log('COD Verifier: UI Type:', settings.uiType);
    
    // ===== MULTI-COUNTRY PHONE VALIDATION =====
    
    const phoneValidationRules = {
        '+91': {
            name: 'India',
            pattern: /^[6-9]\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 7039940998)',
            length: 10
        },
        '+1': {
            name: 'USA',
            pattern: /^[2-9]\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 2125551234)',
            length: 10
        },
        '+44': {
            name: 'UK',
            pattern: /^7\d{9}$/,
            placeholder: 'Enter 10-digit number (e.g., 7700900123)',
            length: 10
        }
    };
    
    function validatePhoneNumber(countryCode, phoneNumber) {
        const rule = phoneValidationRules[countryCode];
        if (!rule) {
            return { valid: false, message: 'Unsupported country code' };
        }
        
        if (!phoneNumber || phoneNumber.length !== rule.length) {
            return { valid: false, message: `Please enter a ${rule.length}-digit ${rule.name} phone number` };
        }
        
        if (!rule.pattern.test(phoneNumber)) {
            return { valid: false, message: `Please enter a valid ${rule.name} phone number` };
        }
        
        return { valid: true, message: 'Valid phone number' };
    }
    
    function updatePhoneHelperText() {
        const countryCode = $('#cod_country_code').val();
        const rule = phoneValidationRules[countryCode];
        if (rule) {
            $('#cod_phone_help_text').text(rule.placeholder);
            $('#cod_phone').attr('placeholder', rule.placeholder.split('(e.g., ')[0].trim());
        }
    }
    
    // ===== NEW: POPUP MODAL FUNCTIONS =====
    
    function openVerificationModal() {
        const $modal = $('#cod-popup-modal');
        if ($modal.length > 0) {
            $modal.show();
            $('body').addClass('cod-modal-open');
            
            // Show the error message when the modal opens
            $modal.find('.cod-popup-error').show();

            console.log('COD Verifier: Modal opened');
        }
    }
    
    function closeVerificationModal() {
        const $modal = $('#cod-popup-modal');
        if ($modal.length > 0) {
            $modal.hide();
            $('body').removeClass('cod-modal-open');
            console.log('COD Verifier: Modal closed');
            
            // Show complete verification button if not verified
            if (!window.codVerifierStatus.otpVerified) {
                showCompleteVerificationButton();
            }
        }
    }
    
    function showPaymentSuccess() {
        const $modal = $('#cod-popup-modal');
        const $error = $modal.find('.cod-popup-error');
        
        $error.hide();
        
        // Show success message in modal
        showMessage('otp', '✅ Verification completed successfully! Modal will close automatically.', 'success');
        
        console.log('COD Verifier: Payment success shown, auto-closing in 5 seconds');
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            closeVerificationModal();
            enablePlaceOrderButton();
            hideCompleteVerificationButton();
        }, 5000);
    }
    
    function showCompleteVerificationButton() {
        if (completeVerificationBtnCreated) {
            $('#cod-complete-verification-btn').show().removeClass('disabled');
            return;
        }
        
        // Find the checkout actions row
        const $actionsRow = $('.wc-block-checkout__actions_row');
        if ($actionsRow.length > 0) {
            const buttonHtml = `
                <button type="button" id="cod-complete-verification-btn" class="cod-complete-verification-btn">
                    🔐 Complete Verification (Click Here)
                </button>
            `;
            
            $actionsRow.before(buttonHtml);
            completeVerificationBtnCreated = true;
            
            // Add click handler
            $('#cod-complete-verification-btn').on('click', function() {
                openVerificationModal();
            });
            
            console.log('COD Verifier: Complete verification button created');
        }
    }
    
    function hideCompleteVerificationButton() {
        $('#cod-complete-verification-btn').hide().addClass('disabled');
        console.log('COD Verifier: Complete verification button hidden');
    }
    
    function enablePlaceOrderButton() {
        const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');
        $placeOrderButton.prop('disabled', false).removeClass('disabled');
        console.log('COD Verifier: Place order button enabled');
    }
    
    // ===== NEW: ERROR MESSAGE FUNCTIONS =====
    
    function showErrorMessage() {
        if (settings.uiType === 'inline') {
            $('#cod-inline-error').show();
        } else {
            $('#cod-popup-error').show();
        }
        console.log('COD Verifier: Error message shown for UI type:', settings.uiType);
    }
    
    function hideErrorMessage() {
        $('#cod-inline-error, #cod-popup-error').hide();
        console.log('COD Verifier: Error messages hidden');
    }
    
    // ===== OTP TIMER FUNCTIONALITY =====
    
    function startOTPTimer(duration) {
        const $btn = $('#cod_send_otp');
        let timeLeft = duration;
        
        // Disable button and change appearance
        $btn.prop('disabled', true)
            .addClass('cod-btn-timer-active')
            .removeClass('cod-btn-primary');
        
        // Update button text immediately
        updateTimerDisplay(timeLeft, $btn);
        
        // Start countdown
        otpTimer = setInterval(() => {
            timeLeft--;
            updateTimerDisplay(timeLeft, $btn);
            
            if (timeLeft <= 0) {
                clearInterval(otpTimer);
                otpTimer = null;
                
                // Re-enable button and restore appearance
                $btn.prop('disabled', false)
                    .removeClass('cod-btn-timer-active')
                    .addClass('cod-btn-primary')
                    .text('Send OTP');
                
                console.log('COD Verifier: OTP timer completed');
            }
        }, 1000);
        
        console.log('COD Verifier: OTP timer started for', duration, 'seconds');
    }
    
    function updateTimerDisplay(timeLeft, $btn) {
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const displayTime = seconds < 10 ? `0${seconds}` : seconds;
            
            if (minutes > 0) {
                $btn.text(`Resend in ${minutes}:${displayTime}`);
            } else {
                $btn.text(`Resend in ${seconds}s`);
            }
        }
    }
    
    function clearOTPTimer() {
        if (otpTimer) {
            clearInterval(otpTimer);
            otpTimer = null;
            
            const $btn = $('#cod_send_otp');
            $btn.prop('disabled', false)
                .removeClass('cod-btn-timer-active')
                .addClass('cod-btn-primary')
                .text('Send OTP');
        }
    }
    
    // ===== UTILITY FUNCTIONS =====
    
    function getSelectedPaymentMethod() {
        let selectedMethod = null;
        
        const selectors = [
            'input#radio-control-wc-payment-method-options-cod:checked',
            'input[name="payment_method"]:checked',
            '.wc-block-components-radio-control__input:checked',
            'input[name*="radio-control-wc-payment-method"]:checked',
            'input[name*="payment-method"]:checked',
            'input.wc-payment-method-input:checked'
        ];
        
        for (let selector of selectors) {
            const $input = $(selector);
            if ($input.length > 0) {
                selectedMethod = $input.val();
                if (selectedMethod) break;
            }
        }
        
        console.log('COD Verifier: Selected payment method:', selectedMethod);
        return selectedMethod;
    }
    
    function createVerificationBox() {
        if (verificationBoxCreated) {
            return $('#cod-verifier-wrapper-active');
        }
        
        const $template = $('#cod-verification-template #cod-verifier-wrapper');
        if ($template.length === 0) {
            console.error('COD Verifier: Template not found in DOM');
            return $();
        }
        
        const $clonedBox = $template.clone();
        $clonedBox.attr('id', 'cod-verifier-wrapper-active');
        
        let $insertionPoint = null;
        
        if (isBlockCheckout) {
            const blockSelectors = [
                '.wc-block-checkout__actions_row',
                '.wc-block-components-checkout-place-order-button',
                '.wp-block-woocommerce-checkout-order-summary-block'
            ];
            
            for (let selector of blockSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found insertion point:', selector);
                    break;
                }
            }
        } else {
            const classicSelectors = [
                '#order_review',
                '.woocommerce-checkout-review-order',
                '#place_order'
            ];
            
            for (let selector of classicSelectors) {
                $insertionPoint = $(selector).first();
                if ($insertionPoint.length > 0) {
                    console.log('COD Verifier: Found insertion point:', selector);
                    break;
                }
            }
        }
        
        if ($insertionPoint && $insertionPoint.length > 0) {
            $insertionPoint.before($clonedBox);
            verificationBoxCreated = true;
            
            // Initialize country code change handler
            initializeCountryCodeHandler();
            
            console.log('COD Verifier: Verification box created');
            return $clonedBox;
        } else {
            console.error('COD Verifier: No suitable insertion point found');
            return $();
        }
    }
    
    function initializeCountryCodeHandler() {
        // Update helper text when country code changes
        $(document).on('change', '#cod_country_code', function() {
            updatePhoneHelperText();
            // Clear phone input when country changes
            $('#cod_phone').val('');
            // Clear any existing messages
            $('#cod_otp_message').removeClass('success error').hide();
        });
        
        // Initialize helper text
        updatePhoneHelperText();
    }
    
    function updateHiddenFields() {
        $('input[name="cod_otp_verified"]').remove();
        $('input[name="cod_token_verified"]').remove();
        
        const $checkoutForm = $('form.checkout, form.wc-block-checkout__form').first();
        if ($checkoutForm.length > 0) {
            $checkoutForm.append('<input type="hidden" name="cod_otp_verified" value="' + (window.codVerifierStatus.otpVerified ? '1' : '0') + '">');
            $checkoutForm.append('<input type="hidden" name="cod_token_verified" value="' + (window.codVerifierStatus.tokenVerified ? '1' : '0') + '">');
        }

        console.log('COD Verifier: Hidden fields updated - OTP:', window.codVerifierStatus.otpVerified, 'Token:', window.codVerifierStatus.tokenVerified);
    }
    
    function updateVerificationStatus() {
        if (codVerifier.enableOTP === '1') {
            const otpBadge = $('#cod-otp-badge');
            if (otpBadge.length) {
                if (window.codVerifierStatus.otpVerified) {
                    otpBadge.text('✓ Verified').removeClass('pending').addClass('verified');
                } else {
                    otpBadge.text('Pending').removeClass('verified').addClass('pending');
                }
            }
        }

        updateHiddenFields();
        updatePlaceOrderButtonState();
    }
    
    function showMessage(type, message, status) {
        const $messageElement = $('#cod_' + type + '_message');
        $messageElement.removeClass('success error').addClass(status).html(message).show();
    }

    function updatePlaceOrderButtonState() {
        console.log('COD Verifier: updatePlaceOrderButtonState triggered.');
        const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');
        const isCODSelectedNow = $('input#radio-control-wc-payment-method-options-cod:checked, input[name="payment_method"][value="cod"]:checked, input[name="payment_method"]:checked[value="cash_on_delivery"], .wc-block-components-radio-control__input:checked[value="cod"], .wc-block-components-radio-control__input:checked[value="cash_on_delivery"], input[name*="radio-control-wc-payment-method"]:checked[value="cod"], input[name*="radio-control-wc-payment-method"]:checked[value="cash_on_delivery"], input[name*="payment-method"]:checked[value="cod"], input[name*="payment-method"]:checked[value="cash_on_delivery"], input.wc-payment-method-input:checked[value="cod"], input.wc-payment-method-input:checked[value="cash_on_delivery"]').length > 0;

        console.log('COD Verifier: isCODSelectedNow:', isCODSelectedNow);
        
        if (isCODSelectedNow) {
            console.log('COD Verifier: COD selected, checking verification status for button state.');
            let canPlaceOrder = true;

            if (codVerifier.enableOTP === '1' && !window.codVerifierStatus.otpVerified) {
                canPlaceOrder = false;
            }

            console.log('COD Verifier: canPlaceOrder:', canPlaceOrder);

            if (canPlaceOrder) {
                $placeOrderButton.prop('disabled', false).removeClass('disabled');
                hideErrorMessage(); // NEW: Hide error when verification complete
                console.log('COD Verifier: Verification complete, enabling place order button.');
            } else {
                $placeOrderButton.prop('disabled', true).addClass('disabled');
                showErrorMessage(); // NEW: Show error when verification incomplete
                console.log('COD Verifier: Verification incomplete, disabling place order button.');
            }
        } else {
            $placeOrderButton.prop('disabled', false).removeClass('disabled');
            hideErrorMessage(); // NEW: Hide error for non-COD
            console.log('COD Verifier: Non-COD selected, enabling place order button.');
        }
    }
    
    // ===== PAYMENT METHOD HANDLING =====
    
    function handlePaymentMethodChange() {
        const selectedMethod = getSelectedPaymentMethod();
        
        if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
            console.log('COD Verifier: COD selected, showing verification UI.');
            
            if (settings.uiType === 'popup') {
                // Popup mode: Open modal
                openVerificationModal();
            } else {
                // Inline mode: Show verification box
                showVerificationBox();
            }
        } else {
            console.log('COD Verifier: Non-COD selected, hiding verification UI.');
            
            if (settings.uiType === 'popup') {
                // Popup mode: Close modal and hide button
                closeVerificationModal();
                hideCompleteVerificationButton();
            } else {
                // Inline mode: Hide verification box
                hideVerificationBox();
            }
        }
        updatePlaceOrderButtonState();
    }
    
    function showVerificationBox() {
        let $wrapper = $('#cod-verifier-wrapper-active');
        
        if ($wrapper.length === 0) {
            $wrapper = createVerificationBox();
        }
        
        if ($wrapper.length > 0) {
            $wrapper.show();
            console.log('COD Verifier: Verification box shown');
            populatePhoneFromBilling();
            updateVerificationStatus();
        }
    }
    
    function hideVerificationBox() {
        const $wrapper = $('#cod-verifier-wrapper-active');
        if ($wrapper.length > 0) {
            $wrapper.hide();
            console.log('COD Verifier: Verification box hidden');
            resetVerificationStates();
        }
    }
    
    function populatePhoneFromBilling() {
        const phoneSelectors = ['#billing_phone', 'input[name*="billing-phone"]', 'input[name*="phone"]'];
        let billingPhone = '';
        
        for (let selector of phoneSelectors) {
            const $phone = $(selector);
            if ($phone.length > 0 && $phone.val()) {
                billingPhone = $phone.val();
                break;
            }
        }
        
        // Extract just the number part if it contains country code
        if (billingPhone) {
            // Remove common prefixes and non-digits
            let cleanPhone = billingPhone.replace(/^\+?91|^\+?1|^\+?44|^0/, '').replace(/\D/g, '');
            
            if (cleanPhone && !$('#cod_phone').val()) {
                $('#cod_phone').val(cleanPhone);
            }
        }
    }
    
    function resetVerificationStates() {
        window.codVerifierStatus.otpVerified = false;
        window.codVerifierStatus.tokenVerified = false;
        $('#cod_otp').val('');
        $('#cod_phone').val('');
        $('#cod_otp_message').removeClass('success error').hide();
        $('#cod_verify_otp').prop('disabled', true).text('Verify').removeClass('verified');
        
        // Clear timers
        clearOTPTimer();
        clearTokenTimer();
        
        updateHiddenFields();
        updateVerificationStatus();
    }
    
    // ===== EVENT LISTENERS FOR PAYMENT METHOD CHANGES =====

    $(document).on('change', 'input[name="payment_method"], .wc-block-components-radio-control__input, input[name*="radio-control-wc-payment-method"], input[name*="payment-method"], input.wc-payment-method-input', handlePaymentMethodChange);

    $(document.body).on('updated_checkout', function() {
        console.log('COD Verifier: updated_checkout triggered');
        setTimeout(updatePlaceOrderButtonState, 300);
        setTimeout(handlePaymentMethodChange, 350);
    });

    $(document).on('change', '#payment, #order_review, .wc-block-checkout', function() {
         console.log('COD Verifier: Payment method section change detected');
         setTimeout(updatePlaceOrderButtonState, 200);
         setTimeout(handlePaymentMethodChange, 250);
    });

    // ===== NEW: POPUP MODAL EVENT LISTENERS =====
    
    // Close modal when clicking overlay or close button
    $(document).on('click', '.cod-popup-overlay, .cod-popup-close', function() {
        closeVerificationModal();
    });
    
    // Prevent modal from closing when clicking inside content
    $(document).on('click', '.cod-popup-content', function(e) {
        e.stopPropagation();
    });

    // Initial checks
    setTimeout(updatePlaceOrderButtonState, 100);
    setTimeout(handlePaymentMethodChange, 150);
    setTimeout(updatePlaceOrderButtonState, 600);
    setTimeout(handlePaymentMethodChange, 650);
    setTimeout(updatePlaceOrderButtonState, 1500);
    setTimeout(handlePaymentMethodChange, 1550);

    // ===== ENHANCED OTP VERIFICATION HANDLERS =====
    
    $(document).on('click', '#cod_send_otp', function(e) {
        e.preventDefault();
        
        const $btn = $(this);

        // Prevent sending if button is disabled (cooldown active)
        if ($btn.is(':disabled')) {
            console.log('COD Verifier: Send OTP button is disabled, preventing resend.');
            return;
        }

        const countryCode = $('#cod_country_code').val();
        const phoneNumber = $('#cod_phone').val().trim();
        
        // Validate phone number
        const validation = validatePhoneNumber(countryCode, phoneNumber);
        if (!validation.valid) {
            showMessage('otp', validation.message, 'error');
            return;
        }
        
        // Create full E.164 format phone number
        const fullPhone = countryCode + phoneNumber;
        
        $btn.prop('disabled', true).text('Sending...');
        
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_send_otp',
                phone: fullPhone,
                country_code: countryCode,
                phone_number: phoneNumber,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data.message, 'success');
                    if (response.data.test_mode && response.data.otp) {
                        alert('TEST MODE - Your OTP is: ' + response.data.otp);
                    }
                    
                    // Start timer with configured duration
                    startOTPTimer(settings.otpTimerDuration);
                    
                    // Enable OTP input
                    $('#cod_otp').prop('disabled', false).focus();
                } else {
                    showMessage('otp', response.data, 'error');
                    $btn.prop('disabled', false).text('Send OTP');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to send OTP. Please try again.', 'error');
                $btn.prop('disabled', false).text('Send OTP');
            }
        });
    });
    
    $(document).on('input', '#cod_otp', function() {
        const otp = $(this).val().trim();
        $('#cod_verify_otp').prop('disabled', otp.length !== 6);
    });
    
    $(document).on('click', '#cod_verify_otp', function(e) {
        e.preventDefault();
        
        const otp = $('#cod_otp').val().trim();
        const $btn = $(this);
        
        if (!otp || otp.length !== 6) {
            showMessage('otp', 'Please enter a valid 6-digit OTP', 'error');
            return;
        }
        
        $btn.prop('disabled', true).text('Verifying...');
        
        $.ajax({
            url: codVerifier.ajaxUrl,
            type: 'POST',
            data: {
                action: 'cod_verify_otp',
                otp: otp,
                nonce: codVerifier.nonce
            },
            success: function(response) {
                if (response.success) {
                    showMessage('otp', response.data, 'success');
                    window.codVerifierStatus.otpVerified = true;
                    $btn.text('✓ Verified').addClass('verified');
                    
                    // Clear timer since verification is complete
                    clearOTPTimer();
                    
                    updateVerificationStatus();
                    
                    // NEW: Handle popup mode success
                    if (settings.uiType === 'popup') {
                        showPaymentSuccess();
                    }
                } else {
                    showMessage('otp', response.data, 'error');
                    $btn.prop('disabled', false).text('Verify');
                }
            },
            error: function() {
                showMessage('otp', 'Failed to verify OTP. Please try again.', 'error');
                $btn.prop('disabled', false).text('Verify');
            }
        });
    });
    
    // ===== CRITICAL VALIDATION FUNCTION =====
    
    function preventOrderPlacement(e) {
        console.log('COD Verifier: preventOrderPlacement triggered (final button check). ');
        const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');

        if ($placeOrderButton.is(':disabled')) {
            console.log('COD Verifier: Order placement prevented by disabled button.');
            if (e && typeof e.preventDefault === 'function') {
                 e.preventDefault();
                 if (typeof e.stopImmediatePropagation === 'function') {
                      e.stopImmediatePropagation();
                 }
                 if (typeof e.stopPropagation === 'function') {
                      e.stopPropagation();
                 }
            }

            const selectedMethod = getSelectedPaymentMethod();
            if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
                 let errors = [];
                 if (codVerifier.enableOTP === '1' && !window.codVerifierStatus.otpVerified) {
                     errors.push('• Phone number verification via OTP');
                 }
                 
                 if (errors.length > 0) {
                    const message = 'Please complete the following steps:\n' + errors.join('\n');
                    
                    if (settings.uiType === 'popup') {
                        // Open modal for verification
                        openVerificationModal();
                    } else {
                        // Show alert for inline mode
                        alert('COD Verification Required:\n\n' + message);
                        
                        const $verificationBox = $('#cod-verifier-wrapper-active');
                        if ($verificationBox.length > 0 && $verificationBox.is(':visible')) {
                            $('html, body').animate({
                                scrollTop: $verificationBox.offset().top - 100
                            }, 500);
                        }
                    }
                 }
            }

            return false;
        }

        console.log('COD Verifier: PreventOrderPlacement check passed, allowing order.');
        return true;
    }
    
    // ===== COMPREHENSIVE VALIDATION EVENT LISTENERS =====

    $(document).on('click', '#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]', function(e) {
        console.log('COD Verifier: Order placement attempted via click');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             e.stopPropagation();
             return false;
        }
    });

    $(document).on('submit', 'form.checkout, form.wc-block-checkout__form, form[name="checkout"]', function(e) {
        console.log('COD Verifier: Form submission attempted');
        if (!preventOrderPlacement(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            return false;
        }
    });

    $(document).on('checkout_place_order', function(e) {
        console.log('COD Verifier: WooCommerce checkout_place_order event');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    $(document).on('checkout_place_order_cod', function(e) {
        console.log('COD Verifier: WooCommerce checkout_place_order_cod event');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    $('form.checkout').on('checkout_place_order', function(e) {
        console.log('COD Verifier: Classic checkout form validation');
        if (!preventOrderPlacement(e)) {
             e.preventDefault();
             e.stopImmediatePropagation();
             return false;
        }
        return true;
    });

    // Additional safety net - continuous validation
    setInterval(function() {
        const selectedMethod = getSelectedPaymentMethod();
        if (selectedMethod === 'cod' || selectedMethod === 'cash_on_delivery') {
            updateHiddenFields();
        } else {
             const $placeOrderButton = $('#place_order, .wc-block-components-checkout-place-order-button, button[type="submit"]');
             if ($placeOrderButton.is(':disabled')) {
                  $placeOrderButton.prop('disabled', false).removeClass('disabled');
                  console.log('COD Verifier: Interval check: Non-COD selected, ensuring button is enabled.');
             }
        }
    }, 1500);

    // Cleanup on page unload
    $(window).on('beforeunload', function() {
        clearOTPTimer();
        clearTokenTimer();
    });

});