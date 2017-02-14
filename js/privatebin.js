/**
 * PrivateBin
 *
 * a zero-knowledge paste bin
 *
 * @see       {@link https://github.com/PrivateBin/PrivateBin}
 * @copyright 2012 Sébastien SAUVAGE ({@link http://sebsauvage.net})
 * @license   {@link https://www.opensource.org/licenses/zlib-license.php The zlib/libpng License}
 * @version   1.1
 * @name      PrivateBin
 * @namespace
 */

/** global: Base64 */
/** global: FileReader */
/** global: RawDeflate */
/** global: history */
/** global: navigator */
/** global: prettyPrint */
/** global: prettyPrintOne */
/** global: showdown */
/** global: sjcl */

// Immediately start random number generator collector.
sjcl.random.startCollectors();

// main application start, called when DOM is fully loaded
jQuery(document).ready(function() {
    // run main controller
    $.PrivateBin.Controller.init();
});

jQuery.PrivateBin = function($, sjcl, Base64, RawDeflate) {
    'use strict';

    /**
     * static Helper methods
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Helper = (function (window, document) {
        var me = {};

        /**
         * character to HTML entity lookup table
         *
         * @see    {@link https://github.com/janl/mustache.js/blob/master/mustache.js#L60}
         * @private
         * @enum   {Object}
         * @readonly
         */
        var entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };

        /**
         * cache for script location
         *
         * @private
         * @enum   {string|null}
         */
        var baseUri = null;

        /**
         * converts a duration (in seconds) into human friendly approximation
         *
         * @name Helper.secondsToHuman
         * @function
         * @param  {number} seconds
         * @return {Array}
         */
        me.secondsToHuman = function(seconds)
        {
            var v;
            if (seconds < 60)
            {
                v = Math.floor(seconds);
                return [v, 'second'];
            }
            if (seconds < 60 * 60)
            {
                v = Math.floor(seconds / 60);
                return [v, 'minute'];
            }
            if (seconds < 60 * 60 * 24)
            {
                v = Math.floor(seconds / (60 * 60));
                return [v, 'hour'];
            }
            // If less than 2 months, display in days:
            if (seconds < 60 * 60 * 24 * 60)
            {
                v = Math.floor(seconds / (60 * 60 * 24));
                return [v, 'day'];
            }
            v = Math.floor(seconds / (60 * 60 * 24 * 30));
            return [v, 'month'];
        };

        /**
         * text range selection
         *
         * @see    {@link https://stackoverflow.com/questions/985272/jquery-selecting-text-in-an-element-akin-to-highlighting-with-your-mouse}
         * @name   Helper.selectText
         * @function
         * @param  {HTMLElement} element
         */
        me.selectText = function(element)
        {
            var range, selection;

            // MS
            if (document.body.createTextRange) {
                range = document.body.createTextRange();
                range.moveToElementText(element);
                range.select();
            } else if (window.getSelection){
                selection = window.getSelection();
                range = document.createRange();
                range.selectNodeContents(element);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };

        /**
         * set text of a jQuery element (required for IE),
         *
         * @name   Helper.setElementText
         * @function
         * @param  {jQuery} $element - a jQuery element
         * @param  {string} text - the text to enter
         */
        me.setElementText = function($element, text)
        {
            // For IE<10: Doesn't support white-space:pre-wrap; so we have to do this...
            if ($('#oldienotice').is(':visible')) {
                var html = me.htmlEntities(text).replace(/\n/ig, '\r\n<br>');
                $element.html('<pre>' + html + '</pre>');
            }
            // for other (sane) browsers:
            else
            {
                $element.text(text);
            }
        };

        /**
         * convert URLs to clickable links.
         * URLs to handle:
         * <pre>
         *     magnet:?xt.1=urn:sha1:YNCKHTQCWBTRNJIV4WNAE52SJUQCZO5C&xt.2=urn:sha1:TXGCZQTH26NL6OUQAJJPFALHG2LTGBC7
         *     http://example.com:8800/zero/?6f09182b8ea51997#WtLEUO5Epj9UHAV9JFs+6pUQZp13TuspAUjnF+iM+dM=
         *     http://user:example.com@localhost:8800/zero/?6f09182b8ea51997#WtLEUO5Epj9UHAV9JFs+6pUQZp13TuspAUjnF+iM+dM=
         * </pre>
         *
         * @name   Helper.urls2links
         * @function
         * @param  {Object} element - a jQuery DOM element
         */
        me.urls2links = function($element)
        {
            var markup = '<a href="$1" rel="nofollow">$1</a>';
            $element.html(
                $element.html().replace(
                    /((http|https|ftp):\/\/[\w?=&.\/-;#@~%+-]+(?![\w\s?&.\/;#~%"=-]*>))/ig,
                    markup
                )
            );
            $element.html(
                $element.html().replace(
                    /((magnet):[\w?=&.\/-;#@~%+-]+)/ig,
                    markup
                )
            );
        };

        /**
         * minimal sprintf emulation for %s and %d formats
         *
         * @see    {@link https://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format#4795914}
         * @name   Helper.sprintf
         * @function
         * @param  {string} format
         * @param  {...*} args - one or multiple parameters injected into format string
         * @return {string}
         */
        me.sprintf = function()
        {
            var args = Array.prototype.slice.call(arguments);
            var format = args[0],
                i = 1;
            return format.replace(/%((%)|s|d)/g, function (m) {
                // m is the matched format, e.g. %s, %d
                var val;
                if (m[2]) {
                    val = m[2];
                } else {
                    val = args[i];
                    // A switch statement so that the formatter can be extended.
                    switch (m)
                    {
                        case '%d':
                            val = parseFloat(val);
                            if (isNaN(val)) {
                                val = 0;
                            }
                            break;
                        default:
                            // Default is %s
                    }
                    ++i;
                }
                return val;
            });
        };

        /**
         * get value of cookie, if it was set, empty string otherwise
         *
         * @see    {@link http://www.w3schools.com/js/js_cookies.asp}
         * @name   Helper.getCookie
         * @function
         * @param  {string} cname
         * @return {string}
         */
        me.getCookie = function(cname) {
            var name = cname + '=',
                ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; ++i) {
                var c = ca[i];
                while (c.charAt(0) === ' ')
                {
                    c = c.substring(1);
                }
                if (c.indexOf(name) === 0)
                {
                    return c.substring(name.length, c.length);
                }
            }
            return '';
        };

        /**
         * get the current location (without search or hash part of the URL),
         * eg. http://example.com/path/?aaaa#bbbb --> http://example.com/path/
         *
         * @name   Helper.baseUri
         * @function
         * @return {string}
         */
        me.baseUri = function()
        {
            // check for cached version
            if (baseUri !== null) {
                return baseUri;
            }

            // get official base uri string, from base tag in head of HTML
            baseUri = document.baseURI;

            // if base uri contains query string (when no base tag is present),
            // it is unwanted
            if (baseUri.indexOf('?')) {
                // so we built our own baseuri
                baseUri = window.location.origin + window.location.pathname;
            }

            return baseUri;
        };

        /**
         * convert all applicable characters to HTML entities
         *
         * @see    {@link https://www.owasp.org/index.php/XSS_(Cross_Site_Scripting)_Prevention_Cheat_Sheet#RULE_.231_-_HTML_Escape_Before_Inserting_Untrusted_Data_into_HTML_Element_Content}
         * @name   Helper.htmlEntities
         * @function
         * @param  {string} str
         * @return {string} escaped HTML
         */
        me.htmlEntities = function(str) {
            return String(str).replace(
                /[&<>"'`=\/]/g, function(s) {
                    return entityMap[s];
                });
        };

        return me;
    })(window, document);

    /**
     * internationalization module
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var I18n = (function (window, document) {
        var me = {};

        /**
         * const for string of loaded language
         *
         * @private
         * @prop   {string}
         * @readonly
         */
        var languageLoadedEvent = 'languageLoaded';

        /**
         * supported languages, minus the built in 'en'
         *
         * @private
         * @prop   {string[]}
         * @readonly
         */
        var supportedLanguages = ['de', 'es', 'fr', 'it', 'no', 'pl', 'oc', 'ru', 'sl', 'zh'];

        /**
         * built in language
         *
         * @private
         * @prop   {string|null}
         */
        var language = null;

        /**
         * translation cache
         *
         * @private
         * @enum   {Object}
         */
        var translations = {};

        /**
         * translate a string, alias for I18n.translate()
         *
         * for a full description see me.translate
         *
         * @name   I18n._
         * @function
         * @param  {jQuery} $element - optional
         * @param  {string} messageId
         * @param  {...*} args - one or multiple parameters injected into placeholders
         * @return {string}
         */
        me._ = function()
        {
            return me.translate.apply(this, arguments);
        };

        /**
         * translate a string
         *
         * Optionally pass a jQuery element as the first parameter, to automatically
         * let the text of this element be replaced. In case the (asynchronously
         * loaded) language is not downloadet yet, this will make sure the string
         * is replaced when it is actually loaded.
         * So for easy translations passing the jQuery object to apply it to is
         * more save, especially when they are loaded in the beginning.
         *
         * @name   I18n.translate
         * @function
         * @param  {jQuery} $element - optional
         * @param  {string} messageId
         * @param  {...*} args - one or multiple parameters injected into placeholders
         * @return {string}
         */
        me.translate = function()
        {
            // convert parameters to array
            var args = Array.prototype.slice.call(arguments),
                messageId,
                $element = null;

            // parse arguments
            if (args[0] instanceof jQuery) {
                // optional jQuery element as first parameter
                $element = args[0];
                args.shift();
            }

            // extract messageId from arguments
            var usesPlurals = $.isArray(args[0]);
            if (usesPlurals) {
                // use the first plural form as messageId, otherwise the singular
                messageId = (args[0].length > 1 ? args[0][1] : args[0][0]);
            } else {
                messageId = args[0];
            }

            if (messageId.length === 0) {
                return messageId;
            }

            // if no translation string cannot be found (in translations object)
            if (!translations.hasOwnProperty(messageId)) {
                // if language is still loading and we have an elemt assigned
                if (language === null && $element !== null) {
                    // handle the error by attaching the language loaded event
                    var orgArguments = arguments;
                    $(document).on(languageLoadedEvent, function () {
                        // re-execute this function
                        me.translate.apply(this, orgArguments);
                        // log to show that the previous error could be mitigated
                        console.log('Fixed missing translation of \'' + messageId + '\' with now loaded language ' + language);
                    });

                    // and fall back to English for now until the real language
                    // file is loaded
                }

                // for all other langauges than English for which thsi behaviour
                // is expected as it is built-in, log error
                if (language !== 'en') {
                    console.error('Missing translation for: \'' + messageId + '\' in language ' + language);
                    // fallback to English
                }

                // save English translation (should be the same on both sides)
                translations[messageId] = args[0];
            }

            // lookup plural translation
            if (usesPlurals && $.isArray(translations[messageId])) {
                var n = parseInt(args[1] || 1, 10),
                    key = me.getPluralForm(n),
                    maxKey = translations[messageId].length - 1;
                if (key > maxKey) {
                    key = maxKey;
                }
                args[0] = translations[messageId][key];
                args[1] = n;
            } else {
                // lookup singular translation
                args[0] = translations[messageId];
            }

            // format string
            var output = Helper.sprintf.apply(this, args);

            // if $element is given, apply text to element
            if ($element !== null) {
                $element.text(output);
            }

            return output;
        };

        /**
         * per language functions to use to determine the plural form
         *
         * @see    {@link http://localization-guide.readthedocs.org/en/latest/l10n/pluralforms.html}
         * @name   I18n.getPluralForm
         * @function
         * @param  {number} n
         * @return {number} array key
         */
        me.getPluralForm = function(n) {
            switch (language)
            {
                case 'fr':
                case 'oc':
                case 'zh':
                    return (n > 1 ? 1 : 0);
                case 'pl':
                    return (n === 1 ? 0 : (n % 10 >= 2 && n %10 <=4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2));
                case 'ru':
                    return (n % 10 === 1 && n % 100 !== 11 ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2));
                case 'sl':
                    return (n % 100 === 1 ? 1 : (n % 100 === 2 ? 2 : (n % 100 === 3 || n % 100 === 4 ? 3 : 0)));
                // de, en, es, it, no
                default:
                    return (n !== 1 ? 1 : 0);
            }
        };

        /**
         * load translations into cache
         *
         * @name   I18n.loadTranslations
         * @function
         */
        me.loadTranslations = function()
        {
            var newLanguage = Helper.getCookie('lang');

            // auto-select language based on browser settings
            if (newLanguage.length === 0) {
                newLanguage = (navigator.language || navigator.userLanguage).substring(0, 2);
            }

            // if language is already used skip update
            if (newLanguage === language) {
                return;
            }

            // if language is built-in (English) skip update
            if (newLanguage === 'en') {
                language = 'en';
                return;
            }

            // if language is not supported, show error
            if (supportedLanguages.indexOf(newLanguage) === -1) {
                console.error('Language \'%s\' is not supported. Translation failed, fallback to English.', newLanguage);
                language = 'en';
                return;
            }

            // load strings from JSON
            $.getJSON('i18n/' + newLanguage + '.json', function(data) {
                language = newLanguage;
                translations = data;
                $(document).triggerHandler(languageLoadedEvent);
            }).fail(function (data, textStatus, errorMsg) {
                console.error('Language \'%s\' could not be loaded (%s: %s). Translation failed, fallback to English.', newLanguage, textStatus, errorMsg);
                language = 'en';
            });
        };

        return me;
    })(window, document);

    /**
     * handles everything related to en/decryption
     *
     * @class
     */
    var CryptTool = (function () {
        var me = {};

        /**
         * compress a message (deflate compression), returns base64 encoded data
         *
         * @name   cryptToolcompress
         * @function
         * @private
         * @param  {string} message
         * @return {string} base64 data
         */
        function compress(message)
        {
            return Base64.toBase64( RawDeflate.deflate( Base64.utob(message) ) );
        }

        /**
         * decompress a message compressed with cryptToolcompress()
         *
         * @name   cryptTooldecompress
         * @function
         * @private
         * @param  {string} data - base64 data
         * @return {string} message
         */
        function decompress(data)
        {
            return Base64.btou( RawDeflate.inflate( Base64.fromBase64(data) ) );
        }

        /**
         * compress, then encrypt message with given key and password
         *
         * @name   CryptTool.cipher
         * @function
         * @param  {string} key
         * @param  {string} password
         * @param  {string} message
         * @return {string} data - JSON with encrypted data
         */
        me.cipher = function(key, password, message)
        {
            // Galois Counter Mode, keysize 256 bit, authentication tag 128 bit
            var options = {
                mode: 'gcm',
                ks: 256,
                ts: 128
            };

            if ((password || '').trim().length === 0)
            {
                return sjcl.encrypt(key, compress(message), options);
            }
            return sjcl.encrypt(key + sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(password)), compress(message), options);
        };

        /**
         * decrypt message with key, then decompress
         *
         * @name   CryptTool.decipher
         * @function
         * @param  {string} key
         * @param  {string} password
         * @param  {string} data - JSON with encrypted data
         * @return {string} decrypted message
         */
        me.decipher = function(key, password, data)
        {
            if (data !== undefined)
            {
                try
                {
                    return decompress(sjcl.decrypt(key, data));
                }
                catch(err)
                {
                    try
                    {
                        return decompress(sjcl.decrypt(key + sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(password)), data));
                    }
                    catch(e)
                    {
                        // ignore error, because ????? @TODO
                    }
                }
            }
            return '';
        };

        /**
         * checks whether the crypt tool is ready.
         *
         * @name   CryptTool.isReady
         * @function
         * @return {bool}
         */
        me.isEntropyReady = function()
        {
            return sjcl.random.isReady();
        };

        /**
         * checks whether the crypt tool is ready.
         *
         * @name   CryptTool.isReady
         * @function
         * @param {function} func
         */
        me.addEntropySeedListener = function(func)
        {
            sjcl.random.addEventListener('seeded', func);
        };

        /**
         * returns a random symmetric key
         *
         * @name   CryptTool.getSymmetricKey
         * @function
         * @return {string} func
         */
        me.getSymmetricKey = function(func)
        {
            return sjcl.codec.base64.fromBits(sjcl.random.randomWords(8, 0), 0);
        };

        /**
         * initialize crypt tool
         *
         * @name   CryptTool.init
         * @function
         */
        me.init = function()
        {
            // will fail earlier as sjcl is already passed as a parameter
            // if (typeof sjcl !== 'object') {
            //     Alert.showError(
            //         I18n._('The library %s is not available.', 'sjcl') +
            //         I18n._('Messages cannot be decrypted or encrypted.')
            //     );
            // }
        };

        return me;
    })();

    /**
     * (modal) Data source (aka MVC)
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Modal = (function (window, document) {
        var me = {};

        var $cipherData;

        var id = null, symmetricKey = null;

        /**
         * returns the expiration set in the HTML
         *
         * @name   Modal.getExpirationDefault
         * @function
         * @return string
         * @TODO the template can be simplified as #pasteExpiration is no longer modified (only default value)
         */
        me.getExpirationDefault = function()
        {
            return $('#pasteExpiration').val();
        };

        /**
         * returns the format set in the HTML
         *
         * @name   Modal.getFormatDefault
         * @function
         * @return string
         * @TODO the template can be simplified as #pasteFormatter is no longer modified (only default value)
         */
        me.getFormatDefault = function()
        {
            return $('#pasteFormatter').val();
        };

        /**
         * check if cipher data was supplied
         *
         * @name   Modal.getCipherData
         * @function
         * @return boolean
         */
        me.hasCipherData = function()
        {
            return (me.getCipherData().length > 0);
        };

        /**
         * returns the cipher data
         *
         * @name   Modal.getCipherData
         * @function
         * @return string
         */
        me.getCipherData = function()
        {
            return $cipherData.text();
        };

        /**
         * get the pastes unique identifier from the URL,
         * eg. http://example.com/path/?c05354954c49a487#dfdsdgdgdfgdf returns c05354954c49a487
         *
         * @name   Modal.getPasteId
         * @function
         * @return {string} unique identifier
         */
        me.getPasteId = function()
        {
            if (id === null) {
                id = window.location.search.substring(1);
            }

            return id;
        };

        /**
         * return the deciphering key stored in anchor part of the URL
         *
         * @name   Modal.getPasteKey
         * @function
         * @return {string} key
         */
        me.getPasteKey = function()
        {
            if (symmetricKey === null) {
                symmetricKey = window.location.hash.substring(1);

                // Some web 2.0 services and redirectors add data AFTER the anchor
                // (such as &utm_source=...). We will strip any additional data.
                var ampersandPos = symmetricKey.indexOf('&');
                if (ampersandPos > -1)
                {
                    symmetricKey = symmetricKey.substring(0, ampersandPos);
                }

            }

            return symmetricKey;
        };

        /**
         * init navigation manager
         *
         * preloads jQuery elements
         *
         * @name   Modal.init
         * @function
         */
        me.init = function()
        {
            $cipherData = $('#cipherdata');
        };

        return me;
    })(window, document);

    /**
     * Helper functions for user interface
     *
     * everything directly UI-related, which fits nowhere else
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var UiHelper = (function (window, document) {
        var me = {};

        /**
         * handle history (pop) state changes
         *
         * currently this does only handle redirects to the home page.
         *
         * @private
         * @function
         * @param  {Event} event
         */
        function historyChange(event)
        {
            var currentLocation = Helper.baseUri();
            if (event.originalEvent.state === null && // no state object passed
                event.originalEvent.target.location.href === currentLocation && // target location is home page
                window.location.href === currentLocation // and we are not already on the home page
            ) {
                // redirect to home page
                window.location.href = currentLocation;
            }
        };

        /**
         * reload the page
         *
         * This takes the user to the PrivateBin homepage.
         *
         * @name   UiHelper.reloadHome
         * @function
         */
        me.reloadHome = function()
        {
            window.location.href = Helper.baseUri();
        };

        /**
         * initialize
         *
         * @name   UiHelper.init
         * @function
         */
        me.init = function()
        {
            // update link to home page
            $('.reloadlink').prop('href', Helper.baseUri());

            $(window).on('popstate', historyChange);
        };

        return me;
    })(window, document);

    /**
     * Alert/error manager
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Alert = (function (window, document) {
        var me = {};

        var $errorMessage,
            $status;

        /**
         * display a status message
         *
         * @name   Alert.showStatus
         * @function
         * @param  {string} message - text to display
         * @param  {boolean} [spin=false] - (optional) tell if the "spinning" animation should be displayed, defaults to false
         */
        me.showStatus = function(message, spin)
        {
            // spin is ignored for now
            $status.text(message);
        };

        /**
         * hides any status messages
         *
         * @name   Alert.hideMessages
         * @function
         */
        me.hideMessages = function()
        {
            $status.html(' ');
            $errorMessage.addClass('hidden');
        };

        /**
         * display an error message
         *
         * @name   Alert.showError
         * @function
         * @param  {string} message - text to display
         */
        me.showError = function(message)
        {
            console.error('Error shown: ' + message);

            $errorMessage.removeClass('hidden');
            $errorMessage.find(':last').text(' ' + message);
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Alert.init
         * @function
         */
        me.init = function()
        {
            // hide "no javascript" message
            $('#noscript').hide();

            $errorMessage = $('#errormessage');
            $status = $('#status');

            // display status returned by php code, if any (eg. paste was properly deleted)
            // @TODO remove this by handling errors in a different way
            if ($status.text().length > 0)
            {
                me.showStatus($status.text());
                return;
            }

            // keep line height even if content empty
            $status.html(' '); // @TODO what? remove?

            // display error message from php code
            if ($errorMessage.text().length > 1) {
                Alert.showError($errorMessage.text());
            }
        };

        return me;
    })(window, document);

    /**
     * handles paste status/result
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var PasteStatus = (function (window, document) {
        var me = {};

        var $pasteSuccess,
            $shortenButton,
            $pasteUrl,
            $remainingTime;

        /**
         * forward to URL shortener
         *
         * @private
         * @function
         * @param  {Event} event
         */
        function sendToShortener(event)
        {
            window.location.href = $shortenButton.data('shortener')
                                   + encodeURIComponent($pasteUrl.attr('href'));
        }

        /**
         * Forces opening the paste if the link does not do this automatically.
         *
         * This is necessary as browsers will not reload the page when it is
         * already loaded (which is fake as it is set via history.pushState()).
         *
         * @name   Controller.pasteLinkClick
         * @function
         * @param  {Event} event
         */
        function pasteLinkClick(event)
        {
            // check if location is (already) shown in URL bar
            if (window.location.href === $pasteUrl.attr('href')) {
                // if so we need to load link by reloading the current site
                window.location.reload(true);
            }
        }

        /**
         * creates a notification after a successfull paste upload
         *
         * @name   PasteStatus.createPasteNotification
         * @function
         * @param  {string} url
         * @param  {string} deleteUrl
         */
        me.createPasteNotification = function(url, deleteUrl)
        {
            $('#pastelink').find(':first').html(
                I18n._(
                    'Your paste is <a id="pasteurl" href="%s">%s</a> <span id="copyhint">(Hit [Ctrl]+[c] to copy)</span>',
                    url, url
                )
            );
            // save newly created element
            $pasteUrl = $('#pasteurl');
            // and add click event
            $pasteUrl.click(pasteLinkClick);

            // shorten button
            $('#deletelink').html('<a href="' + deleteUrl + '">' + I18n._('Delete data') + '</a>');

            // show result
            $pasteSuccess.removeClass('hidden');
            // we pre-select the link so that the user only has to [Ctrl]+[c] the link
            Helper.selectText($pasteUrl[0]);
        };

        /**
         * shows the remaining time
         *
         * @function
         * @param {object} pasteMetaData
         */
        me.showRemainingTime = function(pasteMetaData)
        {
            if (pasteMetaData.burnafterreading) {
                // display paste "for your eyes only" if it is deleted

                // actually remove paste, before we claim it is deleted
                Controller.removePaste(Modal.getPasteId(), 'burnafterreading');

                I18n._($remainingTime.find(':last'), "FOR YOUR EYES ONLY. Don't close this window, this message can't be displayed again.");
                $remainingTime.addClass('foryoureyesonly');

                // discourage cloning (it cannot really be prevented)
                TopNav.hideCloneButton();

            } else if (pasteMetaData.expire_date) {
                // display paste expiration
                var expiration = Helper.secondsToHuman(pasteMetaData.remaining_time),
                    expirationLabel = [
                        'This document will expire in %d ' + expiration[1] + '.',
                        'This document will expire in %d ' + expiration[1] + 's.'
                    ];

                I18n._($remainingTime.find(':last'), expirationLabel, expiration[0]);
                $remainingTime.removeClass('foryoureyesonly')
            } else {
                // never expires
                return;
            }

            // in the end, display notification
            $remainingTime.removeClass('hidden');
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Alert.init
         * @function
         */
        me.init = function()
        {
            $shortenButton = $('#shortenbutton');
            $pasteSuccess = $('#pasteSuccess');
            // $pasteUrl is saved in me.createPasteNotification() after creation
            $remainingTime = $('#remainingtime');

            // bind elements
            $shortenButton.click(sendToShortener);
        };

        return me;
    })(window, document);

    /**
     * password prompt
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Prompt = (function (window, document) {
        var me = {};

        var $passwordModal,
            $passwordForm,
            $passwordDecrypt;

        var password = '',
            passwordCallback = null;

        /**
         * ask the user for the password and set it
         *
         * the callback set via setPasswordCallback is executed
         *
         * @name Prompt.requestPassword()
         * @function
         */
        me.requestPassword = function()
        {
            // show new bootstrap method
            $passwordModal.modal({
                backdrop: 'static',
                keyboard: false
            });
        };

        /**
         * get cached password or password from easy Prompt
         *
         * If you do not get a password with this function, use
         * requestPassword
         *
         * @name   Prompt.getPassword
         * @function
         */
        me.getPassword = function()
        {
            if (password.length !== 0) {
                return password;
            }

            if ($passwordModal.length === 0) {
                // old method for page template
                var newPassword = Prompt(I18n._('Please enter the password for this paste:'), '');
                if (newPassword === null) {
                    throw 'password Prompt canceled';
                }
                if (password.length === 0) {
                    // recursive…
                    me.getPassword();
                } else {
                    password = newPassword;
                }
            }

            return password;
        };

        /**
         * setsthe callback called when password is entered
         *
         * @name   Prompt.setPasswordCallback
         * @function
         * @param {functions} setPasswordCallback
         */
        me.setPasswordCallback = function(callback)
        {
            passwordCallback = callback;
        };

        /**
         * submit a password in the Modal dialog
         *
         * @private
         * @function
         * @param  {Event} event
         */
        function submitPasswordModal(event)
        {
            // get input
            password = $passwordDecrypt.val();

            // hide modal
            $passwordModal.modal('hide');

            if (passwordCallback !== null) {
                passwordCallback();
            }

            event.preventDefault();
        }


        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Controller.init
         * @function
         */
        me.init = function()
        {
            $passwordModal = $('#passwordmodal');
            $passwordForm = $('#passwordform');
            $passwordDecrypt = $('#passworddecrypt');

            // bind events

            // focus password input when it is shown
            $passwordModal.on('shown.bs.Modal', function () {
                $passwordDecrypt.focus();
            });
            // handle Modal password submission
            $passwordForm.submit(submitPasswordModal);
        };

        return me;
    })(window, document);

    /**
     * Manage paste/message input, and preview tab
     *
     * Note that the actual preview is handled by PasteViewer.
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Editor = (function (window, document) {
        var me = {};

        var $message,
            $messageEdit,
            $messagePreview,
            $editorTabs;

        var isPreview = false;

        /**
         * support input of tab character
         *
         * @name   Editor.supportTabs
         * @function
         * @param  {Event} event
         * @TODO doc what is @this here?
         * @TODO replace this with $message ??
         */
        function supportTabs(event)
        {
            var keyCode = event.keyCode || event.which;
            // tab was pressed
            if (keyCode === 9)
            {
                // prevent the textarea to lose focus
                event.preventDefault();
                // get caret position & selection
                var val   = this.value,
                    start = this.selectionStart,
                    end   = this.selectionEnd;
                // set textarea value to: text before caret + tab + text after caret
                this.value = val.substring(0, start) + '\t' + val.substring(end);
                // put caret at right position again
                this.selectionStart = this.selectionEnd = start + 1;
            }
        }

        /**
         * view the Editor tab
         *
         * @name   Editor.viewEditor
         * @function
         * @param  {Event} event - optional
         */
        function viewEditor(event)
        {
            // toggle buttons
            $messageEdit.addClass('active');
            $messagePreview.removeClass('active');

            PasteViewer.hide();

            // reshow input
            $message.removeClass('hidden');

            me.focusInput();

            // finish
            isPreview = false;

            // prevent jumping of page to top
            if (typeof event !== 'undefined') {
                event.preventDefault();
            }
        }

        /**
         * view the preview tab
         *
         * @name   Editor.viewPreview
         * @function
         * @param  {Event} event
         */
        function viewPreview(event)
        {
            // toggle buttons
            $messageEdit.removeClass('active');
            $messagePreview.addClass('active');

            // hide input as now preview is shown
            $message.addClass('hidden');

            // show preview
            $('#errormessage').find(':last')
            PasteViewer.setText($message.val());
            PasteViewer.run();

            // finish
            isPreview = true;

            // prevent jumping of page to top
            if (typeof event !== 'undefined') {
                event.preventDefault();
            }
        }

        /**
         * get the state of the preview
         *
         * @name   Editor.isPreview
         * @function
         */
        me.isPreview = function()
        {
            return isPreview;
        }

        /**
         * reset the Editor view
         *
         * @name   Editor.resetInput
         * @function
         */
        me.resetInput = function()
        {
            // go back to input
            if (isPreview) {
                viewEditor();
            }

            // clear content
            $message.val('');
        };

        /**
         * shows the Editor
         *
         * @name   Editor.show
         * @function
         */
        me.show = function()
        {
            $message.removeClass('hidden');
            $editorTabs.removeClass('hidden');
        };

        /**
         * hides the Editor
         *
         * @name   Editor.reset
         * @function
         */
        me.hide = function()
        {
            $message.addClass('hidden');
            $editorTabs.addClass('hidden');
        };

        /**
         * focuses the message input
         *
         * @name   Editor.focusInput
         * @function
         */
        me.focusInput = function()
        {
            $message.focus();
        };

        /**
         * returns the current text
         *
         * @name   Editor.getText
         * @function
         * @return {string}
         */
        me.getText = function()
        {
            return $message.val()
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Editor.init
         * @function
         */
        me.init = function()
        {
            $message = $('#message');
            $editorTabs = $('#editorTabs');

            // bind events
            $message.keydown(supportTabs);

            // bind click events to tab switchers (a), but save parent of them
            // (li)
            $messageEdit = $('#messageedit').click(viewEditor).parent();
            $messagePreview = $('#messagepreview').click(viewPreview).parent();
        };

        return me;
    })(window, document);

    /**
     * (view) Parse and show paste.
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var PasteViewer = (function (window, document) {
        var me = {};

        var $clonedFile,
            $plainText,
            $placeholder,
            $prettyMessage,
            $prettyPrint;

        var text,
            format = 'plaintext',
            isDisplayed = false,
            isChanged = true; // by default true as nothing was parsed yet

        /**
         * apply the set format on paste and displays it
         *
         * @private
         * @function
         */
        function parsePaste()
        {
            // skip parsing if no text is given
            if (text === '') {
                return;
            }

            // set text
            Helper.setElementText($plainText, text);
            Helper.setElementText($prettyPrint, text);

            switch (format) {
                case 'markdown':
                    var converter = new showdown.Converter({
                        strikethrough: true,
                        tables: true,
                        tablesHeaderId: true
                    });
                    $plainText.html(
                        converter.makeHtml(text)
                    );
                    // add table classes from bootstrap css
                    $plainText.find('table').addClass('table-condensed table-bordered');
                    break;
                case 'syntaxhighlighting':
                    // @TODO is this really needed or is "one" enough?
                    if (typeof prettyPrint === 'function')
                    {
                        prettyPrint();
                    }

                    $prettyPrint.html(
                        prettyPrintOne(
                            Helper.htmlEntities(text), null, true
                        )
                    );
                    // fall through, as the rest is the same
                default: // = 'plaintext'
                    // convert URLs to clickable links
                    Helper.urls2links($plainText);
                    Helper.urls2links($prettyPrint);

                    $prettyPrint.css('white-space', 'pre-wrap');
                    $prettyPrint.css('word-break', 'normal');
                    $prettyPrint.removeClass('prettyprint');
            }
        }

        /**
         * displays the paste
         *
         * @private
         * @function
         */
        function showPaste()
        {
            // instead of "nothing" better display a placeholder
            if (text === '') {
                $placeholder.removeClass('hidden')
                return;
            }
            // otherwise hide the placeholder
            $placeholder.addClass('hidden')

            switch (format) {
                case 'markdown':
                    $plainText.removeClass('hidden');
                    $prettyMessage.addClass('hidden');
                    break;
                default:
                    $plainText.addClass('hidden');
                    $prettyMessage.removeClass('hidden');
                    break;
            }
        }

        /**
         * sets the format in which the text is shown
         *
         * @name   PasteViewer.setFormat
         * @function
         * @param {string}  the the new format
         */
        me.setFormat = function(newFormat)
        {
            if (format !== newFormat) {
                format = newFormat;
                isChanged = true;
            }
        };

        /**
         * returns the current format
         *
         * @name   PasteViewer.setFormat
         * @function
         * @return {string}
         */
        me.getFormat = function()
        {
            return format;
        };

        /**
         * returns whether the current view is pretty printed
         *
         * @name   PasteViewer.isPrettyPrinted
         * @function
         * @return {bool}
         */
        me.isPrettyPrinted = function()
        {
            return $prettyPrint.hasClass('prettyprinted');
        };

        /**
         * sets the text to show
         *
         * @name   Editor.init
         * @function
         * @param {string} newText the text to show
         */
        me.setText = function(newText)
        {
            if (text !== newText) {
                text = newText;
                isChanged = true;
            }
        };

        /**
         * show/update the parsed text (preview)
         *
         * @name   PasteViewer.run
         * @function
         */
        me.run = function()
        {
            if (isChanged) {
                parsePaste();
                isChanged = false;
            }

            if (!isDisplayed) {
                showPaste();
                isDisplayed = true;
            }
        };

        /**
         * hide parsed text (preview)
         *
         * @name   PasteViewer.hide
         * @function
         */
        me.hide = function()
        {
            if (!isDisplayed) {
                console.warn('PasteViewer was called to hide the parsed view, but it is already hidden.');
            }

            $plainText.addClass('hidden');
            $prettyMessage.addClass('hidden');
            $placeholder.addClass('hidden');

            isDisplayed = false;
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Editor.init
         * @function
         */
        me.init = function()
        {
            $plainText = $('#plaintext');
            $placeholder = $('#placeholder');
            $prettyMessage = $('#prettymessage');
            $prettyPrint = $('#prettyprint');

            // check requirements
            if (typeof prettyPrintOne !== 'function') {
                Alert.showError(
                    I18n._('The library %s is not available.', 'pretty print') +
                    I18n._('This may cause display errors.')
                );
            }
            if (typeof showdown !== 'object') {
                Alert.showError(
                    I18n._('The library %s is not available.', 'showdown') +
                    I18n._('This may cause display errors.')
                );
            }

            // get default option from template/HTML or fall back to set value
            format = Modal.getFormatDefault() || format;
        };

        return me;
    })(window, document);

    /**
     * (view) Show attachment and preview if possible
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var AttachmentViewer = (function (window, document) {
        var me = {};

        var $attachment,
            $attachmentLink,
            $clonedFile,
            $attachmentPreview,
            $fileWrap;

        var attachmentChanged = false,
            attachmentHasPreview = false;

        /**
         * sets the attachment but does not yet show it
         *
         * @name   AttachmentViewer.setAttachment
         * @function
         * @param {string} attachmentData - base64-encoded data of file
         * @param {string} fileName - optional, file name
         */
        me.setAttachment = function(attachmentData, fileName)
        {
            var imagePrefix = 'data:image/';

            $attachmentLink.attr('href', attachmentData);
            if (typeof fileName !== 'undefined') {
                $attachmentLink.attr('download', fileName);
            }

            // if the attachment is an image, display it
            if (attachmentData.substring(0, imagePrefix.length) === imagePrefix) {
                $attachmentPreview.html(
                    $(document.createElement('img'))
                        .attr('src', attachmentData)
                        .attr('class', 'img-thumbnail')
                );
                attachmentHasPreview = true;
            }

            attachmentChanged = true;
        };

        /**
         * displays the attachment
         *
         * @name AttachmentViewer.showAttachment
         * @function
         */
        me.showAttachment = function()
        {
            $attachment.removeClass('hidden');

            if (attachmentHasPreview) {
                $attachmentPreview.removeClass('hidden');
            }
        }

        /**
         * removes the existing attachment
         *
         * @name   AttachmentViewer.removeAttachment
         * @function
         */
        me.removeAttachment = function()
        {
             // (new)
            $attachment.addClass('hidden');
            $attachmentPreview.addClass('hidden');

            $clonedFile.addClass('hidden');
            // removes the saved decrypted file data
            $attachmentLink.attr('href', '');
            // the only way to deselect the file is to recreate the input // @TODO really?
            $fileWrap.html($fileWrap.html());
            $fileWrap.removeClass('hidden');

            // reset internal variables
        };

        /**
         * checks if there is an attachment
         *
         * @name   AttachmentViewer.hasAttachment
         * @function
         */
        me.hasAttachment = function()
        {
            return typeof $attachmentLink.attr('href') !== 'undefined'
        };

        /**
         * return the attachment
         *
         * @name   AttachmentViewer.getAttachment
         * @function
         * @returns {array}
         */
        me.getAttachment = function()
        {
            return [
                $attachmentLink.attr('href'),
                $attachmentLink.attr('download')
            ];
        };

        /**
         * initiate
         *
         * preloads jQuery elements
         *
         * @name   AttachmentViewer.init
         * @function
         */
        me.init = function()
        {
            $attachmentPreview = $('#attachmentPreview');
            $attachment = $('#attachment');
            $attachmentLink = $('#attachment a');
            $clonedFile = $('#clonedfile');
            $fileWrap = $('#filewrap');
        };

        return me;
    })(window, document);

    /**
     * (view) Shows discussion thread and handles replies
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var DiscussionViewer = (function (window, document) {
        var me = {};

        var $comments,
            $discussion;

        /**
         * display a status message for replying to comments
         *
         * @name   Controller.showStatus
         * @function
         * @param  {string} message - text to display
         * @param  {boolean} [spin=false] - (optional) tell if the "spinning" animation should be displayed, defaults to false
         */
        me.showReplyStatus = function(message, spin)
        {
            if (spin || false) {
                $replyalert.find('.spinner').removeClass('hidden')
            }
            $replyalert.text(message);
        };

        /**
         * display an error message
         *
         * @name   Alert.showError
         * @function
         * @param  {string} message - text to display
         */
        me.showReplyError = function(message)
        {
            $replyalert.addClass('Alert-danger');
            $replyalert.addClass($errorMessage.attr('class')); // @TODO ????

            $replyalert.text(message);
        };

        /**
         * open the comment entry when clicking the "Reply" button of a comment
         *
         * @name   PasteViewer.openReply
         * @function
         * @param  {Event} event
         */
        me.openReply = function(event)
        {
            event.preventDefault();

            // remove any other reply area
            $('div.reply').remove();

            var source = $(event.target),
                commentid = event.data.commentid,
                hint = I18n._('Optional nickname...'),
                $reply = $('#replytemplate');
            $reply.find('button').click(
                {parentid: commentid},
                me.sendComment
            );
            source.after($reply);
            $replyStatus = $('#replystatus'); // when ID --> put into HTML
            $('#replymessage').focus();
        };

        /**
         * initiate
         *
         * preloads jQuery elements
         *
         * @name   AttachmentViewer.init
         * @function
         */
        me.init = function()
        {
            $comments = $('#comments');
            $discussion = $('#discussion');
            // $replyStatus in openReply()
        };

        return me;
    })(window, document);

    /**
     * Manage top (navigation) bar
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var TopNav = (function (window, document) {
        var me = {};

        var createButtonsDisplayed = false;
        var viewButtonsDisplayed = false;

        var $attach,
            $burnAfterReading,
            $burnAfterReadingOption,
            $cloneButton,
            $expiration,
            $fileRemoveButton,
            $formatter,
            $newButton,
            $openDiscussionOption,
            $openDiscussion,
            $password,
            $passwordInput,
            $rawTextButton,
            $sendButton,
            $loadingIndicator;

        var pasteExpiration = '1week';

        /**
         * set the expiration on bootstrap templates in dropdown
         *
         * @name   TopNav.updateExpiration
         * @function
         * @param  {Event} event
         */
        function updateExpiration(event)
        {
            // get selected option
            var target = $(event.target);

            // update dropdown display and save new expiration time
            $('#pasteExpirationDisplay').text(target.text());
            pasteExpiration = target.data('expiration');

            event.preventDefault();
        }

        /**
         * set the format on bootstrap templates in dropdown
         *
         * @name   TopNav.updateFormat
         * @function
         * @param  {Event} event
         */
        function updateFormat(event)
        {
            // get selected option
            var $target = $(event.target);

            // update dropdown display and save new format
            var newFormat = $target.data('format');
            $('#pasteFormatterDisplay').text($target.text());
            PasteViewer.setFormat(newFormat);

            // update preview
            if (Editor.isPreview()) {
                PasteViewer.run();
            }

            event.preventDefault();
        }

        /**
         * when "burn after reading" is checked, disable discussion
         *
         * @name   TopNav.changeBurnAfterReading
         * @function
         */
        function changeBurnAfterReading()
        {
            if ($burnAfterReading.is(':checked')) {
                $openDiscussionOption.addClass('buttondisabled');
                $openDiscussion.prop('checked', false);

                // if button is actually disabled, force-enable it and uncheck other button
                $burnAfterReadingOption.removeClass('buttondisabled');
            } else {
                $openDiscussionOption.removeClass('buttondisabled');
            }
        }

        /**
         * when discussion is checked, disable "burn after reading"
         *
         * @name   TopNav.changeOpenDiscussion
         * @function
         */
        function changeOpenDiscussion()
        {
            if ($openDiscussion.is(':checked')) {
                $burnAfterReadingOption.addClass('buttondisabled');
                $burnAfterReading.prop('checked', false);

                // if button is actually disabled, force-enable it and uncheck other button
                $openDiscussionOption.removeClass('buttondisabled');
            } else {
                $burnAfterReadingOption.removeClass('buttondisabled');
            }
        }

        /**
         * return raw text
         *
         * @name   TopNav.rawText
         * @function
         * @param  {Event} event
         */
        function rawText(event)
        {
            var paste = PasteViewer.getFormat() === 'markdown' ?
                $prettyPrint.text() : $plainText.text();
            history.pushState(
                null, document.title, Helper.baseUri() + '?' +
                Modal.getPasteId() + '#' + Modal.getPasteKey()
            );
            // we use text/html instead of text/plain to avoid a bug when
            // reloading the raw text view (it reverts to type text/html)
            var newDoc = document.open('text/html', 'replace');
            newDoc.write('<pre>' + Helper.htmlEntities(paste) + '</pre>');
            newDoc.close();

            event.preventDefault();
        }

        /**
         * saves the language in a cookie and reloads the page
         *
         * @name   TopNav.setLanguage
         * @function
         * @param  {Event} event
         */
        function setLanguage(event)
        {
            document.cookie = 'lang=' + $(event.target).data('lang');
            UiHelper.reloadHome();
        }

        /**
         * Shows all elements belonging to viwing an existing pastes
         *
         * @name   TopNav.hideAllElem
         * @function
         */
        me.showViewButtons = function()
        {
            if (viewButtonsDisplayed) {
                console.log('showViewButtons: view buttons are already displayed');
                return;
            }

            $cloneButton.removeClass('hidden');
            $rawTextButton.removeClass('hidden');

            viewButtonsDisplayed = true;
        };

        /**
         * Hides all elements belonging to existing pastes
         *
         * @name   TopNav.hideAllElem
         * @function
         */
        me.hideViewButtons = function()
        {
            if (!viewButtonsDisplayed) {
                console.log('hideViewButtons: view buttons are already hidden');
                return;
            }

            $newButton.removeClass('hidden');
            $cloneButton.addClass('hidden');
            $rawTextButton.addClass('hidden');

            viewButtonsDisplayed = false;
        };

        /**
         * shows all elements needed when creating a new paste
         *
         * @name   TopNav.setLanguage
         * @function
         */
        me.showCreateButtons = function()
        {
            if (createButtonsDisplayed) {
                console.log('showCreateButtons: create buttons are already displayed');
                return;
            }

            $sendButton.removeClass('hidden');
            $expiration.removeClass('hidden');
            $formatter.removeClass('hidden');
            $burnAfterReadingOption.removeClass('hidden');
            $openDiscussionOption.removeClass('hidden');
            $newButton.removeClass('hidden');
            $password.removeClass('hidden');
            $attach.removeClass('hidden');
            // $clonedFile.removeClass('hidden'); // @TODO

            createButtonsDisplayed = true;
        };

        /**
         * shows all elements needed when creating a new paste
         *
         * @name   TopNav.setLanguage
         * @function
         */
        me.hideCreateButtons = function()
        {
            if (!createButtonsDisplayed) {
                console.log('hideCreateButtons: create buttons are already hidden');
                return;
            }

            $newButton.addClass('hidden');
            $sendButton.addClass('hidden');
            $expiration.addClass('hidden');
            $formatter.addClass('hidden');
            $burnAfterReadingOption.addClass('hidden');
            $openDiscussionOption.addClass('hidden');
            $password.addClass('hidden');
            $attach.addClass('hidden');
            // $clonedFile.addClass('hidden'); // @TODO

            createButtonsDisplayed = false;
        };

        /**
         * only shows the "new paste" button
         *
         * @name   TopNav.setLanguage
         * @function
         */
        me.showNewPasteButton = function()
        {
            $newButton.removeClass('hidden');
        };

        /**
         * only hides the clone button
         *
         * @name   TopNav.hideCloneButton
         * @function
         */
        me.hideCloneButton = function()
        {
            $cloneButton.addClass('hidden');
        };

        /**
         * only hides the raw text button
         *
         * @name   TopNav.hideRawButton
         * @function
         */
        me.hideRawButton = function()
        {
            $rawTextButton.addClass('hidden');
        };

        /**
         * shows a loading message, optionally with a percentage
         *
         * @name   TopNav.showLoading
         * @function
         * @param  {string} message optional, default: 'Loading…'
         * @param  {int}    percentage optional, default: null
         */
        me.showLoading = function(message, percentage)
        {
            // default message text
            if (typeof message === 'undefined') {
                message = I18n._('Loading…');
            }

            // currently percentage parameter is ignored
            if (message !== null) {
                $loadingIndicator.find(':last').text(message);
            }
            $loadingIndicator.removeClass('hidden');
        };

        /**
         * hides the loading message
         *
         * @name   TopNav.hideLoading
         * @function
         */
        me.hideLoading = function()
        {
            $loadingIndicator.addClass('hidden');
        };

        /**
         * collapses the navigation bar if nedded
         *
         * @name   TopNav.collapseBar
         * @function
         */
        me.collapseBar = function()
        {
            var $bar = $('.navbar-toggle');

            // check if bar is expanded
            if ($bar.hasClass('collapse in')) {
                // if so, toggle it
                $bar.click();
            }
        };

        /**
         * returns the currently set expiration time
         *
         * @name   TopNav.getExpiration
         * @function
         * @return {int}
         */
        me.getExpiration = function()
        {
            return pasteExpiration;
        };

        /**
         * returns the currently selected file(s)
         *
         * @name   TopNav.getFileList
         * @function
         * @return {FileList|null}
         */
        me.getFileList = function()
        {
            var $file = $('#file');

            // if no file given, return null
            if (!$file.length || !$file[0].files.length) {
                return null;
            }
            // @TODO is this really necessary
            if (!($file[0].files && $file[0].files[0])) {
                return null;
            }

            return $file[0].files;
        };

        /**
         * returns the state of the burn after reading checkbox
         *
         * @name   TopNav.getExpiration
         * @function
         * @return {bool}
         */
        me.getBurnAfterReading = function()
        {
            return $burnAfterReading.is(':checked');
        };

        /**
         * returns the state of the discussion checkbox
         *
         * @name   TopNav.getOpenDiscussion
         * @function
         * @return {bool}
         */
        me.getOpenDiscussion = function()
        {
            return $openDiscussion.is(':checked');
        };

        /**
         * returns the entered password
         *
         * @name   TopNav.getPassword
         * @function
         * @return {string}
         */
        me.getPassword = function()
        {
            return $passwordInput.val();
        };

        /**
         * init navigation manager
         *
         * preloads jQuery elements
         *
         * @name   TopNav.init
         * @function
         */
        me.init = function()
        {
            $attach = $('#attach');
            $burnAfterReading = $('#burnafterreading');
            $burnAfterReadingOption = $('#burnafterreadingoption');
            $cloneButton = $('#clonebutton');
            $expiration = $('#expiration');
            $fileRemoveButton = $('#fileremovebutton');
            $formatter = $('#formatter');
            $newButton = $('#newbutton');
            $openDiscussionOption = $('#opendiscussionoption');
            $openDiscussion = $('#opendiscussion');
            $password = $('#password');
            $passwordInput = $('#passwordinput');
            $rawTextButton = $('#rawtextbutton');
            $sendButton = $('#sendbutton');
            $loadingIndicator = $('#loadingindicator');

            // bootstrap template drop down
            $('#language ul.dropdown-menu li a').click(me.setLanguage);
            // page template drop down
            $('#language select option').click(me.setLanguage);

            // bind events
            $burnAfterReading.change(changeBurnAfterReading);
            $openDiscussionOption.change(changeOpenDiscussion);
            $newButton.click(Controller.newPaste);
            $sendButton.click(PasteEncrypter.submitPaste);
            $cloneButton.click(Controller.clonePaste);
            $rawTextButton.click(rawText);
            $fileRemoveButton.click(me.removeAttachment);

            // bootstrap template drop downs
            $('ul.dropdown-menu li a', $('#expiration').parent()).click(updateExpiration);
            $('ul.dropdown-menu li a', $('#formatter').parent()).click(updateFormat);

            // initiate default state of checkboxes
            changeBurnAfterReading();
            changeOpenDiscussion();

            // get default value from template or fall back to set value
            pasteExpiration = Modal.getExpirationDefault() || pasteExpiration;
        };

        return me;
    })(window, document);

    /**
     * Responsible for AJAX requests, transparently handles encryption…
     *
     * @class
     */
    var Uploader = (function () {
        var me = {};

        var successFunc = null,
            failureFunc = null,
            url,
            data,
            randomKey,
            password;

        /**
         * public variable ('constant') for errors to prevent magic numbers
         *
         * @readonly
         * @enum   {Object}
         */
        me.error = {
            okay: 0,
            custom: 1,
            unknown: 2,
            serverError: 3
        };

        /**
         * ajaxHeaders to send in AJAX requests
         *
         * @private
         * @readonly
         * @enum   {Object}
         */
        var ajaxHeaders = {'X-Requested-With': 'JSONHttpRequest'};

        /**
         * called after successful upload
         *
         * @function
         * @param {int} status
         * @param {int} data - optional
         */
        function success(status, result)
        {
            // add useful data to result
            result.encryptionKey = randomKey;
            result.requestData = data;

            if (successFunc !== null) {
                successFunc(status, result);
            }
        }

        /**
         * called after a upload failure
         *
         * @name   Uploader.submitPasteUpload
         * @function
         * @param {int} status - internal code
         * @param {int} data - original error code
         */
        function fail(status, result)
        {
            if (failureFunc !== null) {
                failureFunc(status, result);
            }
        }

        /**
         * actually uploads the data
         *
         * @name   Uploader.run
         * @function
         */
        me.run = function()
        {
            $.ajax({
                type: 'POST',
                url: url,
                data: data,
                dataType: 'json',
                headers: ajaxHeaders,
                success: function(result) {
                    if (result.status === 0) {
                        success(0, result);
                    } else if (result.status === 1) {
                        fail(1, result);
                    } else {
                        fail(2, result);
                    }
                }
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error(textStatus, errorThrown);
                fail(3, jqXHR);
            });
        };

        /**
         * set success function
         *
         * @name   Uploader.setSuccess
         * @function
         * @param {function} func
         */
        me.setUrl = function(newUrl)
        {
            url = newUrl;
        };

        /**
         * set success function
         *
         * @name   Uploader.setSuccess
         * @function
         * @param {function} func
         */
        me.setSuccess = function(func)
        {
            successFunc = func;
        };

        /**
         * set failure function
         *
         * @name   Uploader.setSuccess
         * @function
         * @param {function} func
         */
        me.setFailure = function(func)
        {
            failureFunc = func;
        };

        /**
         * prepares a new upload
         *
         * @name   Uploader.prepare
         * @function
         * @param {string} newPassword
         * @return {object}
         */
        me.prepare = function(newPassword)
        {
            // set password
            password = newPassword;

            // entropy should already be checked!

            // generate a new random key
            randomKey = CryptTool.getSymmetricKey();

            // reset data
            successFunc = null;
            failureFunc = null;
            url = Helper.baseUri()
            data = {};
        };

        /**
         * encrypts and sets the data
         *
         * @name   Uploader.setData
         * @function
         * @param {string} index
         * @param {mixed} element
         */
        me.setData = function(index, element)
        {
            data[index] = CryptTool.cipher(randomKey, password, element);
        };

        /**
         * set the additional metadata to send unencrypted
         *
         * @name   Uploader.setUnencryptedData
         * @function
         * @param {string} index
         * @param {mixed} element
         */
        me.setUnencryptedData = function(index, element)
        {
            data[index] = element;
        };

        /**
         * set the additional metadata to send unencrypted passed at once
         *
         * @name   Uploader.setUnencryptedData
         * @function
         * @param {object} newData
         */
        me.setUnencryptedBulkData = function(newData)
        {
            $.extend(data, newData);
        };

        /**
         * init Uploader
         *
         * @name   Uploader.init
         * @function
         */
        me.init = function()
        {
            // nothing yet
        };

        return me;
    })();

    /**
     * (controller) Responsible for encrypting paste and sending it to server.
     *
     * @name state
     * @class
     */
    var PasteEncrypter = (function () {
        var me = {};

        var requirementsChecked = false;

        /**
         * checks whether there is a suitable amount of entrophy
         *
         * @private
         * @function
         * @param {function} retryCallback - the callback to execute to retry the upload
         * @return {bool}
         */
        function checkRequirements(retryCallback) {
            // skip double requirement checks
            if (requirementsChecked === true) {
                return false;
            }

            if (!CryptTool.isEntropyReady()) {
                // display a message and wait
                Alert.showStatus(I18n._('Please move your mouse for more entropy...'));

                CryptTool.addEntropySeedListener(retryCallback);
                return false;
            }

            requirementsChecked = true;

            return true;
        }

        /**
         * called after successful upload
         *
         * @private
         * @function
         * @param {int} status
         * @param {int} data
         */
        function showCreatedPaste(status, data) {
            TopNav.hideLoading();

            var url = Helper.baseUri() + '?' + data.id + '#' + data.encryptionKey,
                deleteUrl = Helper.baseUri() + '?pasteid=' + data.id + '&deletetoken=' + data.deletetoken;

            Alert.hideMessages();

            // show notification
            PasteStatus.createPasteNotification(url, deleteUrl)

            // show new URL in browser bar
            history.pushState({type: 'newpaste'}, document.title, url);

            TopNav.showViewButtons();
            TopNav.hideRawButton();
            Editor.hide();

            // parse and show text
            // (preparation already done in me.submitPaste())
            PasteViewer.run();
        }

        /**
         * adds attachments to the Uploader
         *
         * @private
         * @function
         * @param {File|null|undefined} file - optional, falls back to cloned attachment
         * @param {function} callback - excuted when action is successful
         */
        function encryptAttachments(file, callback) {
            if (typeof file !== 'undefined' && file !== null) {
                // check file reader requirements for upload
                if (typeof FileReader === 'undefined') {
                    Alert.showError(I18n._('Your browser does not support uploading encrypted files. Please use a newer browser.'));
                    // cancels process as it does not execute callback
                    return;
                }

                var reader = new FileReader();

                // closure to capture the file information
                reader.onload = function(event) {
                    Uploader.setData('attachment', event.target.result);
                    Uploader.setData('attachmentname', file.name);

                    // run callback
                    callback();
                };

                // actually read first file
                reader.readAsDataURL(file);
            } else if (AttachmentViewer.hasAttachment()) {
                // fall back to cloned part
                var attachment = AttachmentViewer.getAttachment();

                Uploader.setData('attachment', attachment[0]);
                Uploader.setUnencryptedData('attachmentname', attachment[1]); // @TODO does not encrypt file name??!
                callback();
            } else {
                // if there are no attachments, this is of course still successful
                callback();
            }
        }

        /**
         * send a reply in a discussion
         *
         * @name   PasteEncrypter.sendComment
         * @function
         * @param  {Event} event
         * @TODO WIP
         */
        me.sendComment = function(event)
        {
            event.preventDefault();
            $errorMessage.addClass('hidden');
            // do not send if no data
            var replyMessage = $('#replymessage');
            if (replyMessage.val().length === 0)
            {
                return;
            }

            me.showStatus(I18n._('Sending comment...'), true);
            var parentid = event.data.parentid,
                key = Modal.getPasteKey(),
                cipherdata = CryptTool.cipher(key, $passwordInput.val(), replyMessage.val()),
                ciphernickname = '',
                nick = $('#nickname').val();
            if (nick.length > 0)
            {
                ciphernickname = CryptTool.cipher(key, $passwordInput.val(), nick);
            }
            var dataToSend = {
                data:     cipherdata,
                parentid: parentid,
                pasteid:  Modal.getPasteId(),
                nickname: ciphernickname
            };

            $.ajax({
                type: 'POST',
                url: Helper.baseUri(),
                data: dataToSend,
                dataType: 'json',
                headers: ajaxHeaders,
                success: function(data) {
                    if (data.status === 0)
                    {
                        status.showStatus(I18n._('Comment posted.'));
                        $.ajax({
                            type: 'GET',
                            url: Helper.baseUri() + '?' + Modal.getPasteId(),
                            dataType: 'json',
                            headers: ajaxHeaders,
                            success: function(data) {
                                if (data.status === 0)
                                {
                                    me.displayMessages(data);
                                }
                                else if (data.status === 1)
                                {
                                    Alert.showError(I18n._('Could not refresh display: %s', data.message));
                                }
                                else
                                {
                                    Alert.showError(I18n._('Could not refresh display: %s', I18n._('unknown status')));
                                }
                            }
                        })
                        .fail(function() {
                            Alert.showError(I18n._('Could not refresh display: %s', I18n._('server error or not responding')));
                        });
                    }
                    else if (data.status === 1)
                    {
                        Alert.showError(I18n._('Could not post comment: %s', data.message));
                    }
                    else
                    {
                        Alert.showError(I18n._('Could not post comment: %s', I18n._('unknown status')));
                    }
                }
            })
            .fail(function() {
                Alert.showError(I18n._('Could not post comment: %s', I18n._('server error or not responding')));
            });
        };

        /**
         * sends a new paste to server
         *
         * @name   PasteEncrypter.submitPaste
         * @function
         */
        me.submitPaste = function()
        {
            // UI loading state
            TopNav.hideCreateButtons();
            TopNav.showLoading(I18n._('Sending paste...'), 0);
            TopNav.collapseBar();

            // get data
            var plainText = Editor.getText(),
                format = PasteViewer.getFormat(),
                files = TopNav.getFileList();

            // do not send if there is no data
            if (plainText.length === 0 && files === null) {
                // revert loading status…
                TopNav.hideLoading();
                TopNav.showCreateButtons();
                return;
            }

            TopNav.showLoading(I18n._('Sending paste...'), 10);

            // check entropy
            if (!checkRequirements(function () {
                me.submitPaste();
            })) {
                return; // to prevent multiple executions
            }

            // prepare Uploader
            Uploader.prepare(TopNav.getPassword());

            // set success/fail functions
            Uploader.setSuccess(showCreatedPaste);
            Uploader.setFailure(function (status, data) {
                // revert loading status…
                TopNav.hideLoading();
                TopNav.showCreateButtons();

                // show error message
                switch (status) {
                    case Uploader.error['custom']:
                        Alert.showError(I18n._('Could not create paste: %s', data.message));
                        break;
                    case Uploader.error['unknown']:
                        Alert.showError(I18n._('Could not create paste: %s', I18n._('unknown status')));
                        break;
                    case Uploader.error['serverError']:
                        Alert.showError(I18n._('Could not create paste: %s', I18n._('server error or not responding')));
                        break;
                    default:
                        Alert.showError(I18n._('Could not create paste: %s', I18n._('unknown error')));
                        break;
                }
            });

            // fill it with unencrypted submitted options
            Uploader.setUnencryptedBulkData({
                expire:           TopNav.getExpiration(),
                formatter:        format,
                burnafterreading: TopNav.getBurnAfterReading() ? 1 : 0,
                opendiscussion:   TopNav.getOpenDiscussion() ? 1 : 0
            });

            // prepare PasteViewer for later preview
            PasteViewer.setText(plainText);
            PasteViewer.setFormat(format);

            // encrypt cipher data
            Uploader.setData('data', plainText);

            // encrypt attachments
            encryptAttachments(
                files === null ? null : files[0],
                function () {
                    // send data
                    Uploader.run();
                }
            );
        };

        /**
         * initialize
         *
         * @name   PasteEncrypter.init
         * @function
         */
        me.init = function()
        {
            // nothing yet
        };

        return me;
    })();

    /**
     * (controller) Responsible for decrypting cipherdata and passing data to view.
     *
     * @name state
     * @class
     */
    var PasteDecrypter = (function () {
        var me = {};

        /**
         * decrypt the actual paste text
         *
         * @private
         * @function
         * @param {object} paste - paste data in object form
         * @param {string} key
         * @param {string} password
         * @return {bool} - whether action was successful
         */
        function decryptPaste(paste, key, password)
        {
            // try decryption without password
            var plaintext = CryptTool.decipher(key, password, paste.data);

            // if it fails, request password
            if (plaintext.length === 0 && password.length === 0) {
                // get password
                password = Prompt.getPassword();

                // if password is there, re-try
                if (password.length !== 0) {
                    // recursive
                    // note: an infinite loop is prevented as the previous if
                    // clause checks whether a password is already set and ignores
                    // error with password being passed
                    return decryptPaste(paste, key, password);
                }

                // trigger password request
                Prompt.requestPassword();
                // the callback (via setPasswordCallback()) should have been set
                // by parent function
                return false;
            }

            // if all tries failed, we can only throw an error
            if (plaintext.length === 0) {
                throw 'failed to decipher message';
            }

            // on success show paste
            PasteViewer.setFormat(paste.meta.formatter);
            PasteViewer.setText(plaintext);
            // trigger to show the text (attachment loaded afterwards)
            PasteViewer.run();

            return true;
        }

        /**
         * decrypts any attachment
         *
         * @private
         * @function
         * @param {object} paste - paste data in object form
         * @param {string} key
         * @param {string} password
         * @return {bool} - whether action was successful
         */
        function decryptAttachment(paste, key, password)
        {
            // decrypt attachment
            var attachment = CryptTool.decipher(key, password, paste.attachment);
            if (attachment.length === 0) {
                throw 'failed to decipher attachment';
            }

            // decrypt attachment name
            var attachmentName;
            if (paste.attachmentname) {
                attachmentName = attachmentName = CryptTool.decipher(key, password, paste.attachmentname);
                if (attachmentName.length === 0) {
                    // @TODO considering the buggy cloning (?, see other todo comment) this might affect previous pastes
                    throw 'failed to decipher attachment name';
                }
            }

            AttachmentViewer.setAttachment(attachment, attachmentName);
            AttachmentViewer.showAttachment();
        }

        /**
         * show decrypted text in the display area, including discussion (if open)
         *
         * @name   PasteDecrypter.run
         * @function
         * @param  {Object} [paste] - (optional) object including comments to display (items = array with keys ('data','meta'))
         */
        me.run = function(paste)
        {
            TopNav.showLoading('Decrypting paste…');

            if (typeof paste === 'undefined') {
                paste = $.parseJSON(Modal.getCipherData());
            }

            var key = Modal.getPasteKey(),
                password = Prompt.getPassword();

            if (PasteViewer.isPrettyPrinted()) {
                console.error('Too pretty! (don\'t know why this check)'); //@TODO
                return;
            }

            // try to decrypt the paste
            try {
                Prompt.setPasswordCallback(function () {
                    me.run(paste);
                });

                // try to decrypt paste and if it fails (because the password is
                // missing) return to let JS continue and wait for user
                if (!decryptPaste(paste, key, password)) {
                    return;
                }

                // decrypt attachments
                if (paste.attachment) {
                    decryptAttachment(paste, key, password);
                }
            } catch(err) {
                TopNav.hideLoading();

                // log and show error
                console.error(err);
                Alert.showError(I18n._('Could not decrypt data (Wrong key?)')); // @TODO error is not translated

                // still go on to potentially show potentially partially decrypted data
            }

            // shows the remaining time (until) deletion
            PasteStatus.showRemainingTime(paste.meta);

            // if the discussion is opened on this paste, display it
            // @TODO BELOW
            if (paste.meta.opendiscussion) {
                $comments.html('');

                var $divComment;

                // iterate over comments
                for (var i = 0; i < paste.comments.length; ++i)
                {
                    var $place = $comments,
                        comment = paste.comments[i],
                        commentText = CryptTool.decipher(key, password, comment.data),
                        $parentComment = $('#comment_' + comment.parentid);

                    $divComment = $('<article><div class="comment" id="comment_' + comment.id
                               + '"><div class="commentmeta"><span class="nickname"></span>'
                               + '<span class="commentdate"></span></div>'
                               + '<div class="commentdata"></div>'
                               + '<button class="btn btn-default btn-sm">'
                               + I18n._('Reply') + '</button></div></article>');
                    var $divCommentData = $divComment.find('div.commentdata');

                    // if parent comment exists
                    if ($parentComment.length)
                    {
                        // shift comment to the right
                        $place = $parentComment;
                    }
                    $divComment.find('button').click({commentid: comment.id}, me.openReply);
                    Helper.setElementText($divCommentData, commentText);
                    Helper.urls2links($divCommentData);

                    // try to get optional nickname
                    var nick = CryptTool.decipher(key, password, comment.meta.nickname);
                    if (nick.length > 0)
                    {
                        $divComment.find('span.nickname').text(nick);
                    }
                    else
                    {
                        divComment.find('span.nickname').html('<i>' + I18n._('Anonymous') + '</i>');
                    }
                    $divComment.find('span.commentdate')
                              .text(' (' + (new Date(comment.meta.postdate * 1000).toLocaleString()) + ')')
                              .attr('title', 'CommentID: ' + comment.id);

                    // if an avatar is available, display it
                    if (comment.meta.vizhash)
                    {
                        $divComment.find('span.nickname')
                                  .before(
                                    '<img src="' + comment.meta.vizhash + '" class="vizhash" title="' +
                                    I18n._('Anonymous avatar (Vizhash of the IP address)') + '" /> '
                                  );
                    }

                    $place.append($divComment);
                }

                // add 'add new comment' area
                $divComment = $(
                    '<div class="comment"><button class="btn btn-default btn-sm">' +
                    I18n._('Add comment') + '</button></div>'
                );
                $divComment.find('button').click({commentid: Modal.getPasteId()}, me.openReply);
                $comments.append($divComment);
                $discussion.removeClass('hidden');
            }

            TopNav.hideLoading();
            TopNav.showViewButtons();
        };

        /**
         * initialize
         *
         * @name   PasteDecrypter.init
         * @function
         */
        me.init = function()
        {
            // nothing yet
        };

        return me;
    })();

    /**
     * (controller) main PrivateBin logic
     *
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    var Controller = (function (window, document) {
        var me = {};

        /**
         * creates a new paste
         *
         * @name   Controller.newPaste
         * @function
         */
        me.newPaste = function()
        {
            TopNav.hideViewButtons();
            TopNav.showCreateButtons();
            PasteViewer.hide();
            Editor.resetInput();
            Editor.show();
            Editor.focusInput();
            Alert.hideMessages();
        };

        /**
         * clone the current paste
         *
         * @name   Controller.clonePaste
         * @function
         * @param  {Event} event
         */
        me.clonePaste = function(event)
        {
            me.stateNewPaste();

            // erase the id and the key in url
            history.replaceState(null, document.title, Helper.baseUri());

            Alert.hideMessages();
            if ($attachmentLink.attr('href'))
            {
                $clonedFile.removeClass('hidden');
                $fileWrap.addClass('hidden');
            }
            $message.val(
                PasteViewer.getFormat() === 'markdown' ?
                    $prettyPrint.val() : $plainText.val()
            );
            TopNav.collapseBar();
        };

        /**
         * removes a saved paste
         *
         * @name   Controller.removePaste
         * @function
         * @param  {string} pasteId
         * @param  {string} deleteToken
         */
        me.removePaste = function(pasteId, deleteToken) {
            // unfortunately many web servers don't support DELETE (and PUT) out of the box
            // so we use a POST request
            Uploader.prepare();
            Uploader.setUrl(Helper.baseUri() + '?' + pasteId);
            Uploader.setUnencryptedData('deletetoken', deleteToken);

            Uploader.setFailure(function () {
                Controller.showError(I18n._('Could not delete the paste, it was not stored in burn after reading mode.'));
            })
            Uploader.run();
        };

        /**
         * application start
         *
         * @name   Controller.init
         * @function
         */
        me.init = function()
        {
            // first load translations
            I18n.loadTranslations();

            // initialize other modules/"classes"
            Alert.init();
            Uploader.init();
            Modal.init();
            CryptTool.init();
            UiHelper.init();
            TopNav.init();
            Editor.init();
            PasteStatus.init();
            PasteViewer.init();
            AttachmentViewer.init();
            DiscussionViewer.init();
            PasteEncrypter.init();
            PasteDecrypter.init();
            Prompt.init();

            // display an existing paste
            if (Modal.hasCipherData()) {
                // missing decryption key in URL?
                if (window.location.hash.length === 0) {
                    Alert.showError(I18n._('Cannot decrypt paste: Decryption key missing in URL (Did you use a redirector or an URL shortener which strips part of the URL?)'));
                    return;
                }

                // show proper elements on screen
                PasteDecrypter.run();
                return;
            }

            // otherwise create a new paste
            me.newPaste();
        };

        return me;
    })(window, document);

    return {
        Helper: Helper,
        I18n: I18n,
        CryptTool: CryptTool,
        TopNav: TopNav,
        Alert: Alert,
        Uploader: Uploader,
        Controller: Controller
    };
}(jQuery, sjcl, Base64, RawDeflate);
