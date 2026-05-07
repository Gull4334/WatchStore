// src/utils/whatsapp.js — WhatsApp message link builder

/**
 * Build a wa.me deep-link with a pre-filled message.
 * Replaces all template placeholders from settings.
 */
const buildWaLink = (phoneNumber, template, replacements = {}) => {
  if (!template || !phoneNumber) return null;

  // Normalise PK number: strip leading + and spaces
  const phone = phoneNumber.replace(/^\+/, '').replace(/\s/g, '');

  let message = template;
  Object.entries(replacements).forEach(([key, val]) => {
    message = message.replaceAll(`[${key}]`, val ?? '');
  });

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

module.exports = { buildWaLink };
