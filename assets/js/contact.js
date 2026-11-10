/**
 * MINE-THE-GAP "Get in touch" dialog (shared by minethegap.eu and maps.minethegap.eu).
 *
 * Adds one native <dialog> with the contact form to the page and opens it from any
 * element marked [data-contact-open] (the "Contact" nav link, the footer button), and
 * on load when the address ends in #contact. No email address appears on the page:
 * the message is posted to the app's contact endpoint, which forwards it.
 *
 * Contract with the endpoint (https://app.minethegap.eu/api/contact):
 *   POST application/x-www-form-urlencoded (a CORS "simple" request: no preflight),
 *   fields name, email, subject, message, website (honeypot, must be empty),
 *   started (ms timestamp when the dialog opened) and page (location.href).
 *   200 {"ok": true}                      -> thank-you message
 *   400/429 {"ok": false, "error": "..."} -> the error is shown, the input is kept
 * Everything the server says is shown with textContent, never as HTML.
 */
(function () {
    'use strict';

    var ENDPOINT = 'https://app.minethegap.eu/api/contact';
    var MIN = 20;
    var MAX = 5000;
    var GENERIC_ERROR = 'Sorry, the message could not be sent right now. Please try again later.';
    var THANKS = 'Thank you — your message was sent. We will reply by email.';

    // Static markup only (no data is interpolated).
    var MARKUP =
        '<div class="contact-inner">' +
          '<div class="contact-head">' +
            '<h2 id="contact-title">Get in touch</h2>' +
            '<button type="button" class="contact-x" data-contact-close aria-label="Close">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="contact-body">' +
            '<p class="contact-intro">Questions about the project, the data or a position? Send us a message.</p>' +
            '<form class="contact-form" action="' + ENDPOINT + '" method="post" accept-charset="UTF-8">' +
              '<div class="contact-field">' +
                '<label for="contact-name">Name</label>' +
                '<input id="contact-name" name="name" type="text" required maxlength="120" autocomplete="name">' +
              '</div>' +
              '<div class="contact-field">' +
                '<label for="contact-email">Email</label>' +
                '<input id="contact-email" name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email">' +
              '</div>' +
              '<div class="contact-field">' +
                '<label for="contact-subject">Subject <span class="optional">(optional)</span></label>' +
                '<input id="contact-subject" name="subject" type="text" maxlength="150">' +
              '</div>' +
              '<div class="contact-field">' +
                '<label for="contact-message">Message</label>' +
                '<textarea id="contact-message" name="message" required minlength="' + MIN + '" maxlength="' + MAX + '" rows="6" aria-describedby="contact-counter"></textarea>' +
                '<span class="contact-counter" id="contact-counter" aria-live="polite"></span>' +
              '</div>' +
              '<div class="visually-hidden" aria-hidden="true">' +
                '<label for="contact-website">Website (leave empty)</label>' +
                '<input id="contact-website" name="website" type="text" autocomplete="off" tabindex="-1">' +
              '</div>' +
              '<input type="hidden" name="started" value="">' +
              '<input type="hidden" name="page" value="">' +
              '<p class="contact-privacy">We use your name and email only to reply to you.</p>' +
              '<p class="contact-error" role="alert" hidden></p>' +
              '<div class="contact-actions">' +
                '<button type="button" class="btn-secondary" data-contact-close>Cancel</button>' +
                '<button type="submit" class="btn-primary">Send message</button>' +
              '</div>' +
            '</form>' +
            '<div class="contact-done" hidden>' +
              '<p role="status"></p>' +
              '<div class="contact-actions"><button type="button" class="btn-primary" data-contact-close>Close</button></div>' +
            '</div>' +
          '</div>' +
        '</div>';

    var dialog, form, errorBox, done, counter, message, submitBtn, sending = false;

    function build() {
        dialog = document.createElement('dialog');
        dialog.className = 'contact-dialog';
        dialog.id = 'contact-dialog';
        dialog.setAttribute('aria-labelledby', 'contact-title');
        dialog.innerHTML = MARKUP;
        document.body.appendChild(dialog);

        form = dialog.querySelector('form');
        errorBox = dialog.querySelector('.contact-error');
        done = dialog.querySelector('.contact-done');
        counter = dialog.querySelector('.contact-counter');
        message = form.elements.message;
        submitBtn = form.querySelector('button[type="submit"]');

        message.addEventListener('input', updateCounter);
        form.addEventListener('submit', onSubmit);
        dialog.querySelectorAll('[data-contact-close]').forEach(function (b) {
            b.addEventListener('click', function () { dialog.close(); });
        });
        // A click on the backdrop (outside the box) closes it too.
        dialog.addEventListener('click', function (e) {
            if (e.target !== dialog) return;
            var r = dialog.getBoundingClientRect();
            var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) dialog.close();
        });
        updateCounter();
    }

    function updateCounter() {
        var n = message.value.length;
        counter.textContent = n < MIN
            ? n + ' / ' + MAX + ' — at least ' + MIN + ' characters'
            : n + ' / ' + MAX;
        counter.classList.toggle('is-short', n > 0 && n < MIN);
    }

    // After a successful send the message stays in view but cannot be edited or sent again: the fields are disabled
    // and Cancel / Send give way to the thank-you note and a single Close button.
    function lock(on) {
        Array.prototype.forEach.call(form.elements, function (el) { el.disabled = on; });
        form.querySelector('.contact-actions').hidden = on;
        form.classList.toggle('is-sent', on);
    }

    function showError(text) {
        errorBox.textContent = text;
        errorBox.hidden = false;
    }

    function open() {
        if (!dialog) build();
        if (!done.hidden) {           // after a sent message, start a fresh form
            form.reset();
            lock(false);
            done.hidden = true;
            updateCounter();
        }
        errorBox.hidden = true;
        form.elements.started.value = String(Date.now());
        if (!dialog.open) dialog.showModal();
        form.elements.name.focus();
    }

    function onSubmit(e) {
        e.preventDefault();
        if (sending) return;
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (message.value.trim().length < MIN) {
            message.setCustomValidity('Please write at least ' + MIN + ' characters.');
            form.reportValidity();
            message.setCustomValidity('');
            return;
        }
        form.elements.page.value = location.href;
        errorBox.hidden = true;
        sending = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        fetch(ENDPOINT, {
            method: 'POST',
            body: new URLSearchParams(new FormData(form)),
            mode: 'cors',
            credentials: 'omit'
        }).then(function (r) {
            return r.json().then(
                function (data) { return { status: r.status, data: data }; },
                function () { return { status: r.status, data: null }; }
            );
        }).then(function (res) {
            if (res.status === 200 && res.data && res.data.ok === true) {
                lock(true);
                done.querySelector('p').textContent = THANKS;
                done.hidden = false;
                done.querySelector('button').focus();
            } else if ((res.status === 400 || res.status === 429) && res.data && typeof res.data.error === 'string' && res.data.error) {
                showError(res.data.error);
            } else {
                showError(GENERIC_ERROR);
            }
        }).catch(function () {
            showError(GENERIC_ERROR);
        }).then(function () {
            sending = false;
            submitBtn.textContent = 'Send message';
            if (done.hidden) submitBtn.disabled = false;  // still sendable unless it was sent
        });
    }

    // Delegated, so it also works for links rendered later by the header/footer elements.
    document.addEventListener('click', function (e) {
        var trigger = e.target.closest && e.target.closest('[data-contact-open]');
        if (!trigger) return;
        e.preventDefault();
        open();
    });

    function openFromHash() { if (location.hash === '#contact') open(); }
    window.addEventListener('hashchange', openFromHash);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', openFromHash);
    } else {
        openFromHash();
    }

    window.mtgOpenContact = open;
})();
