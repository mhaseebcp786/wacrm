// Verbatim payloads captured from the reference app trial
// (docs/saas/specs/reference-app/01-suggested-replies.md §3), used as test
// fixtures. Only URLs/ids that the spec elides ("...") are filled in. The
// quick-reply carousel is reconstructed from the spec's one card sample
// (second card, body and per-card id suffix are invented).

const IMG = 'https://app.example.com/storage/orgs/2465/abc-card-1.jpg';
const IMG2 = 'https://app.example.com/storage/orgs/2465/abc-card-2.jpg';

export const SAMPLE_TEXT = {
  message_type: 'text',
  payload: {
    type: 'text',
    text: {
      body: 'Hello {{contact.name}}, thanks for contacting Invicto Associates LLP.',
      preview_url: true,
    },
  },
};

export const SAMPLE_REPLY_BUTTONS = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Which product line are you interested in?' },
      footer: { text: 'Invicto Associates LLP' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: '1792584007253_20acl', title: 'Laminates' },
          },
          {
            type: 'reply',
            reply: { id: '1792584010380_lq2ye', title: 'Wall panels' },
          },
        ],
      },
    },
  },
};

export const SAMPLE_CTA = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: 'See our full product range.' },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: 'View range',
          url: 'https://www.invictoassociatesllp.in/products',
        },
      },
    },
  },
};

export const SAMPLE_LIST = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: 'Choose a category' },
      action: {
        button: 'Categories',
        sections: [
          {
            title: 'Interiors',
            rows: [
              {
                id: 'opt_1792584140199_hxzpu',
                title: 'Laminates',
                description: 'Veneer and acrylic laminates',
              },
            ],
          },
        ],
      },
    },
  },
};

export const SAMPLE_IMAGE = {
  message_type: 'image',
  payload: {
    type: 'image',
    image: { link: IMG, caption: 'Welmica Syncrow Woodgrain laminates' },
  },
};

/** URL-button carousel exactly as the reference app stores it (`message_type: "interactive"`). */
export const SAMPLE_CAROUSEL_URL = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: 'Our latest laminate collections' },
      action: {
        cards: [
          {
            card_index: 0,
            type: 'cta_url',
            header: { type: 'image', image: { link: IMG } },
            body: { text: 'Welmica Syncrow Woodgrain' },
            action: {
              name: 'cta_url',
              parameters: {
                url: 'https://www.invictoassociatesllp.in/products',
                display_text: 'View range',
              },
            },
          },
          {
            card_index: 1,
            type: 'cta_url',
            header: { type: 'image', image: { link: IMG2 } },
            body: { text: 'Lavvic Acrylic Marble' },
            action: {
              name: 'cta_url',
              parameters: {
                url: 'https://www.invictoassociatesllp.in/products',
                display_text: 'View range',
              },
            },
          },
        ],
      },
    },
  },
};

/** Quick-reply carousel: the reference app emits `card.type: "button"`. */
export const SAMPLE_CAROUSEL_QR = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: 'Pick a card' },
      action: {
        cards: [0, 1].map((n) => ({
          card_index: n,
          type: 'button',
          header: { type: 'image', image: { link: n ? IMG2 : IMG } },
          action: {
            buttons: [
              {
                type: 'quick_reply',
                quick_reply: {
                  id: `qr_1792585152611_y2dfz${n}`,
                  title: 'Know more',
                },
              },
            ],
          },
          body: { text: `Card ${n + 1}` },
        })),
      },
    },
  },
};
