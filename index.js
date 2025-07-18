import {
    extension_settings,
    loadExtensionSettings,
} from "../../../extensions.js";
import {
    saveSettingsDebounced,
    power_user
} from "../../../../script.js";

// Extension metadata
const extensionName = "st-custom-fonts";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Default settings structure
const defaultSettings = {
    fonts: {
        google: [],
        local: [],
    },
    activeFont: null,
    autoLoad: true,
    overrideThemeFont: false,
    notifications: true,
};

// Local state
let settings = {};
let fontStyleElement = null;

// Show toast notifications based on user setting
function notify(message, type = 'success') {
    if (settings.notifications) {
        toastr[type](message);
    }
}

/**
 * Applies a font to the main UI elements.
 * @param {string} fontName The name of the font to apply.
 */
function applyFont(fontName) {
    if (!fontName) return;

    // Find the font in our settings
    const isGoogleFont = settings.fonts.google.some(f => f.name === fontName);
    const isLocalFont = settings.fonts.local.some(f => f.name === fontName);

    if (!isGoogleFont && !isLocalFont) {
        notify(`Font "${fontName}" not found.`, 'error');
        return;
    }

    // If it's a Google Font, ensure its <link> tag is in the head
    if (isGoogleFont) {
        const font = settings.fonts.google.find(f => f.name === fontName);
        const linkId = `google-font-${font.name.replace(/\s/g, '-')}`;
        if (!document.getElementById(linkId)) {
            const linkElement = document.createElement('link');
            linkElement.id = linkId;
            linkElement.rel = 'stylesheet';
            linkElement.href = font.link;
            document.head.appendChild(linkElement);
        }
    }
    
    // Apply the font family using a CSS variable for easy override
    document.documentElement.style.setProperty('--custom-font-family', `"${fontName}", 'Noto Color Emoji', sans-serif`);

    // Add a style rule to apply the variable, unless theme override is off.
    const overrideStyleId = 'st-custom-fonts-override-style';
    let overrideStyleElement = document.getElementById(overrideStyleId);

    if (!settings.overrideThemeFont) {
        if (overrideStyleElement) overrideStyleElement.remove();
        return; // Don't apply if not overriding theme
    }

    if (!overrideStyleElement) {
        overrideStyleElement = document.createElement('style');
        overrideStyleElement.id = overrideStyleId;
        document.head.appendChild(overrideStyleElement);
    }

    // Apply font to all essential elements
    const selectors = "body, select, .font-family-reset, .swipes-counter, textarea, #send_textarea, .text_pole, button, .menu_button";
    overrideStyleElement.innerHTML = `${selectors} { font-family: var(--custom-font-family) !important; }`;
    
    settings.activeFont = fontName;
    saveSettingsDebounced();
    notify(`Applied font: ${fontName}`);
}

/**
 * Injects @font-face rules for all local fonts into the document head.
 */
function injectLocalFontStyles() {
    if (!fontStyleElement) {
        fontStyleElement = document.createElement('style');
        fontStyleElement.id = 'st-custom-fonts-local-defs';
        document.head.appendChild(fontStyleElement);
    }

    const fontFaceRules = settings.fonts.local.map(font => `
        @font-face {
            font-family: "${font.name}";
            src: url(${font.data});
        }
    `).join('\n');

    fontStyleElement.innerHTML = fontFaceRules;
}

/**
 * Renders the list of saved fonts in the management section.
 */
function renderFontList() {
    const container = $('#font_list_container');
    const select = $('#font_select');
    container.empty();
    select.empty();

    select.append('<option value="">Select a font...</option>');

    const allFonts = [
        ...settings.fonts.google.map(f => ({ ...f, type: 'Google' })),
        ...settings.fonts.local.map(f => ({ ...f, type: 'Local' })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    if (allFonts.length === 0) {
        container.html('<p style="text-align:center; color: var(--text-color-secondary);">No custom fonts added yet.</p>');
        return;
    }

    allFonts.forEach(font => {
        // Populate the select dropdown
        const option = new Option(font.name, font.name);
        select.append(option);

        // Populate the managed list
        const item = $(`
            <div class="cf-font-item">
                <div>
                    <span class="cf-font-type">${font.type}</span>
                    <span class="cf-font-name">${font.name}</span>
                </div>
                <button class="cf-delete-button" data-font-name="${font.name}" title="Delete font">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `);
        container.append(item);
    });

    // Set active font in dropdown
    if (settings.activeFont) {
        select.val(settings.activeFont);
    }

    $('.cf-delete-button').on('click', function() {
        const fontName = $(this).data('font-name');
        removeFont(fontName);
    });
}

/**
 * Adds a new Google Font to the settings.
 */
function addGoogleFont() {
    const name = $('#google_font_name').val().trim();
    const link = $('#google_font_link').val().trim();

    if (!name || !link) {
        return notify('Both name and link are required for Google Fonts.', 'error');
    }
    if (settings.fonts.google.some(f => f.name === name) || settings.fonts.local.some(f => f.name === name)) {
        return notify(`A font named "${name}" already exists.`, 'error');
    }
    if (!link.startsWith('https://fonts.googleapis.com/css')) {
        return notify('Please use a valid Google Fonts API link.', 'error');
    }

    settings.fonts.google.push({ name, link });
    saveSettingsDebounced();
    notify(`Added Google Font: ${name}`);
    renderFontList();

    $('#google_font_name').val('');
    $('#google_font_link').val('');
}

/**
 * Handles the selection of a local font file.
 * @param {Event} event The file input change event.
 */
function handleLocalFontFile(event) {
    const file = event.target.files[0];
    const name = $('#local_font_name').val().trim();
    const filenameDisplay = $('#local_font_filename');

    if (!file) return;

    if (!name) {
        filenameDisplay.text('Please enter a name first.').css('color', '#ff5555');
        return notify('Please provide a name for the local font first.', 'error');
    }
    if (settings.fonts.google.some(f => f.name === name) || settings.fonts.local.some(f => f.name === name)) {
        filenameDisplay.text('Name already exists.').css('color', '#ff5555');
        return notify(`A font named "${name}" already exists.`, 'error');
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        settings.fonts.local.push({ name, data: e.target.result });
        injectLocalFontStyles();
        saveSettingsDebounced();
        notify(`Added local font: ${name}`);
        renderFontList();

        // Reset inputs
        $('#local_font_name').val('');
        filenameDisplay.text('No file selected.').css('color', '');
        $('#local_font_file').val(''); // Reset file input
    };
    reader.onerror = function() {
        notify('Failed to read font file.', 'error');
        filenameDisplay.text('File read error.').css('color', '#ff5555');
    };
    reader.readAsDataURL(file);
}

/**
 * Removes a font by name from settings.
 * @param {string} fontName The name of the font to remove.
 */
function removeFont(fontName) {
    let wasActive = (settings.activeFont === fontName);

    // Try removing from local fonts
    let initialLength = settings.fonts.local.length;
    settings.fonts.local = settings.fonts.local.filter(f => f.name !== fontName);
    if (settings.fonts.local.length < initialLength) {
        injectLocalFontStyles(); // Re-inject styles without the deleted font
    }

    // Try removing from Google fonts
    settings.fonts.google = settings.fonts.google.filter(f => f.name !== fontName);
    
    if (wasActive) {
        settings.activeFont = null;
        // Potentially add logic here to revert to a default font
        document.documentElement.style.removeProperty('--custom-font-family');
        $('#st-custom-fonts-override-style').remove();
    }

    saveSettingsDebounced();
    notify(`Removed font: ${fontName}`);
    renderFontList();
}


/**
 * Main initialization function.
 */
jQuery(async () => {
    // Load settings and HTML
    settings = { ...defaultSettings, ...extension_settings[extensionName] };
    settings.fonts = { ...defaultSettings.fonts, ...settings.fonts };
    extension_settings[extensionName] = settings;

    const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
    $("#extensions_settings").append(settingsHtml);

    // Setup event listeners
    $('#add_google_font_button').on('click', addGoogleFont);
    $('#local_font_file').on('change', handleLocalFontFile);
    $('#apply_font_button').on('click', () => applyFont($('#font_select').val()));
    
    // Update filename display when a file is chosen
    $('#local_font_file').on('change', function() {
        const filename = this.files.length > 0 ? this.files[0].name : 'No file selected.';
        $('#local_font_filename').text(filename).css('color', '');
    });

    // Settings listeners
    $('#auto_load_font').on('input', function() {
        settings.autoLoad = $(this).prop('checked');
        saveSettingsDebounced();
    }).prop('checked', settings.autoLoad);

    $('#override_theme_font').on('input', function() {
        settings.overrideThemeFont = $(this).prop('checked');
        saveSettingsDebounced();
        // Re-apply font to update override style
        applyFont(settings.activeFont);
    }).prop('checked', settings.overrideThemeFont);

    $('#notifications_enabled').on('input', function() {
        settings.notifications = $(this).prop('checked');
        saveSettingsDebounced();
    }).prop('checked', settings.notifications);
    
    // Initial setup
    injectLocalFontStyles();
    renderFontList();

    // Auto-apply font on load if enabled
    if (settings.autoLoad && settings.activeFont) {
        // Use a small delay to ensure theme fonts have loaded first
        setTimeout(() => {
            applyFont(settings.activeFont);
        }, 500);
    }
});