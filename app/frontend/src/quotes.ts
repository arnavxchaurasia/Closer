// 50 curated love quotes — rotate daily, works offline
export const LOVE_QUOTES = [
  { text: "In all the world, there is no heart for me like yours.", author: "Maya Angelou" },
  { text: "I love you not only for what you are, but for what I am when I am with you.", author: "Roy Croft" },
  { text: "You are my sun, my moon, and all my stars.", author: "E.E. Cummings" },
  { text: "Whatever our souls are made of, his and mine are the same.", author: "Emily Brontë" },
  { text: "I would rather spend one lifetime with you than face all the ages of this world alone.", author: "J.R.R. Tolkien" },
  { text: "The best thing to hold onto in life is each other.", author: "Audrey Hepburn" },
  { text: "To be fully seen by somebody, then, and be loved anyhow — this is a human offering that can border on miraculous.", author: "Elizabeth Gilbert" },
  { text: "I love you. I am who I am because of you.", author: "Nicholas Sparks" },
  { text: "You don't love someone for their looks, or their clothes, or for their fancy car, but because they sing a song only you can hear.", author: "Oscar Wilde" },
  { text: "I have waited for this opportunity for more than half a century, to repeat to you once again my vow of eternal fidelity and everlasting love.", author: "Gabriel García Márquez" },
  { text: "The heart wants what it wants — or else it does not care.", author: "Emily Dickinson" },
  { text: "I am nothing special, of this I am sure. I am a common person with common thoughts and I've led a common life. There are no monuments dedicated to me and my name will soon be forgotten, but in one respect I have succeeded as gloriously as anyone who ever lived: I have loved another with all my heart and soul, and to me, this has always been enough.", author: "Nicholas Sparks" },
  { text: "You know you're in love when you can't fall asleep because reality is finally better than your dreams.", author: "Dr. Seuss" },
  { text: "Being deeply loved by someone gives you strength, while loving someone deeply gives you courage.", author: "Lao Tzu" },
  { text: "The minute I heard my first love story I started looking for you, not knowing how blind that was. Lovers don't finally meet somewhere. They're in each other all along.", author: "Rumi" },
  { text: "I saw that you were perfect, and so I loved you. Then I saw that you were not perfect and I loved you even more.", author: "Angelita Lim" },
  { text: "Love is composed of a single soul inhabiting two bodies.", author: "Aristotle" },
  { text: "At the touch of love everyone becomes a poet.", author: "Plato" },
  { text: "The best love is the kind that awakens the soul and makes us reach for more, that plants a fire in our hearts and brings peace to our minds.", author: "Nicholas Sparks" },
  { text: "I love you without knowing how, or when, or from where. I love you simply, without problems or pride.", author: "Pablo Neruda" },
  { text: "Do I love you? My God, if your love were a grain of sand, mine would be a universe of beaches.", author: "William Goldman" },
  { text: "Love is when the other person's happiness is more important than your own.", author: "H. Jackson Brown Jr." },
  { text: "I carry your heart with me. I carry it in my heart.", author: "E.E. Cummings" },
  { text: "True love stories never have endings.", author: "Richard Bach" },
  { text: "The real lover is the man who can thrill you by kissing your forehead.", author: "Marilyn Monroe" },
  { text: "I want to be your favorite hello and your hardest goodbye.", author: "Unknown" },
  { text: "Distance means so little when someone means so much.", author: "Tom McNeal" },
  { text: "I'll love you, my whole life, you and no other.", author: "J.R.R. Tolkien" },
  { text: "Love is an irresistible desire to be irresistibly desired.", author: "Robert Frost" },
  { text: "The moment you have in your heart this extraordinary thing called love and feel the depth, the delight, the ecstasy of it, you will discover that for you the world is transformed.", author: "Jiddu Krishnamurti" },
  { text: "There are only two times that I want to be with you — now and forever.", author: "Unknown" },
  { text: "Love is the voice under all silences, the hope which has no opposite in fear.", author: "E.E. Cummings" },
  { text: "You are every reason, every hope, and every dream I've ever had.", author: "Nicholas Sparks" },
  { text: "Whatever you are, be a good one.", author: "Abraham Lincoln" },
  { text: "I need you like a heart needs a beat.", author: "Unknown" },
  { text: "If I know what love is, it is because of you.", author: "Hermann Hesse" },
  { text: "You had me at hello.", author: "Jerry Maguire" },
  { text: "I choose you. And I'll choose you over and over and over. Without pause, without a doubt, in a heartbeat. I'll keep choosing you.", author: "Unknown" },
  { text: "I would have followed you, my brother, my captain, my king.", author: "J.R.R. Tolkien" },
  { text: "Love recognizes no barriers. It jumps hurdles, leaps fences, penetrates walls to arrive at its destination full of hope.", author: "Maya Angelou" },
  { text: "To love another person is to see the face of God.", author: "Victor Hugo" },
  { text: "Wherever you are is my home, my only home.", author: "Jane Eyre" },
  { text: "I look at you and see the rest of my life in front of my eyes.", author: "Unknown" },
  { text: "You fill places in my heart I never knew were empty.", author: "Unknown" },
  { text: "My soul and your soul are forever tangled.", author: "N.R. Hart" },
  { text: "Real love is a permanently self-enlarging experience.", author: "M. Scott Peck" },
  { text: "Once in a while, right in the middle of an ordinary life, love gives us a fairy tale.", author: "Unknown" },
  { text: "Stars can't shine without darkness — and our love is the brightest star I know.", author: "Unknown" },
  { text: "We loved with a love that was more than love.", author: "Edgar Allan Poe" },
  { text: "To the world you may be one person, but to one person you may be the whole world.", author: "Dr. Seuss" },
];

// Returns the same quote for the whole calendar day, changes at midnight
export function getDailyQuote() {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return LOVE_QUOTES[dayIndex % LOVE_QUOTES.length];
}

export function getRandomQuote(excludeIdx?: number) {
  let idx = Math.floor(Math.random() * LOVE_QUOTES.length);
  if (idx === excludeIdx) idx = (idx + 1) % LOVE_QUOTES.length;
  return { quote: LOVE_QUOTES[idx], idx };
}
