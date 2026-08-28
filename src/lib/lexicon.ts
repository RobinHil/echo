// Lexique de champs semantiques.
//
// Le reste de l'analyse lit la *forme* du texte : ponctuation, longueur des
// mots, majuscules. Elle ne sait rien de ce dont le texte parle. Ce lexique
// ajoute cette dimension : il rattache les mots a seize champs, chacun porteur
// d'une intention musicale.
//
// Consequence recherchee : deux textes sur la mer sonnent comme des cousins
// (meme couleur, memes instruments) sans sonner pareil (le rythme et la forme
// restent pilotes par la surface du texte).
//
// C'est une table de correspondance ecrite pour cette application, pas un
// releve de normes psychometriques : le mapping vise l'effet musical. Elle est
// donc libre de toute restriction d'usage, contrairement aux lexiques
// affectifs publies, dont la redistribution est interdite.
//
// Les racines sont ecrites sans accent : la recherche normalise les mots
// avant de comparer, pour qu'un texte tape sans accents reste reconnu.

export type SemanticField =
  | 'eau'
  | 'feu'
  | 'nuit'
  | 'lumiere'
  | 'nature'
  | 'violence'
  | 'amour'
  | 'mort'
  | 'joie'
  | 'tristesse'
  | 'temps'
  | 'ville'
  | 'machine'
  | 'corps'
  | 'voyage'
  | 'silence'

export interface FieldTrait {
  // Couleur affective [-1..1], oriente le choix de la gamme.
  valence: number
  // Agitation [0..1], nourrit l'energie donc le style et le tempo.
  arousal: number
  // Ampleur [0..1], nourrit la reverberation et le delay.
  space: number
  // Instabilite [0..1], nourrit la progression harmonique et les echos.
  tension: number
}

export const FIELD_TRAITS: Record<SemanticField, FieldTrait> = {
  eau: { valence: 0.3, arousal: 0.35, space: 0.85, tension: 0.2 },
  feu: { valence: 0.1, arousal: 0.85, space: 0.3, tension: 0.6 },
  nuit: { valence: -0.35, arousal: 0.2, space: 0.8, tension: 0.35 },
  lumiere: { valence: 0.75, arousal: 0.5, space: 0.55, tension: 0.15 },
  nature: { valence: 0.55, arousal: 0.3, space: 0.7, tension: 0.15 },
  violence: { valence: -0.85, arousal: 0.95, space: 0.15, tension: 0.95 },
  amour: { valence: 0.85, arousal: 0.45, space: 0.5, tension: 0.25 },
  mort: { valence: -0.8, arousal: 0.2, space: 0.75, tension: 0.5 },
  joie: { valence: 0.9, arousal: 0.8, space: 0.3, tension: 0.15 },
  tristesse: { valence: -0.6, arousal: 0.25, space: 0.65, tension: 0.4 },
  temps: { valence: -0.1, arousal: 0.2, space: 0.8, tension: 0.35 },
  ville: { valence: -0.15, arousal: 0.65, space: 0.2, tension: 0.55 },
  machine: { valence: 0, arousal: 0.7, space: 0.15, tension: 0.6 },
  corps: { valence: 0.15, arousal: 0.45, space: 0.35, tension: 0.3 },
  voyage: { valence: 0.35, arousal: 0.6, space: 0.6, tension: 0.3 },
  silence: { valence: 0.25, arousal: 0.05, space: 0.95, tension: 0.1 },
}

// Racines par champ. Une racine capte toute la famille morphologique :
// "neig" couvre neige, neiger, neigeux, enneige.
const STEM_GROUPS: Record<SemanticField, string[]> = {
  eau: [
    'eau', 'mer', 'ocean', 'vague', 'marin', 'maree', 'flot', 'onde', 'pluie', 'pleuv',
    'riviere', 'fleuve', 'ruisseau', 'torrent', 'lac', 'etang', 'fontaine', 'cascade',
    'nage', 'noyer', 'noie', 'plong', 'humide', 'mouill', 'tremp', 'goutte', 'ecume',
    'brume', 'brouillard', 'nuage', 'orage', 'averse', 'deluge', 'inond', 'submerg',
    'quai', 'rive', 'berge', 'plage', 'algue', 'coquill', 'recif', 'lagune',
    'bateau', 'barque', 'voilier', 'navire', 'navig', 'derive', 'courant', 'abysse',
    'glace', 'neig', 'givre', 'gel', 'fondre', 'liquide', 'ruissel', 'houle', 'remous',
  ],
  feu: [
    'feu', 'flamme', 'brul', 'brasier', 'incendie', 'ardent', 'ardeur', 'braise', 'cendre',
    'fumee', 'chaleur', 'chaud', 'canicule', 'torride', 'bouillant', 'fournaise', 'forge',
    'soleil', 'solaire', 'desert', 'aride', 'secheresse',
    'rouge', 'ecarlate', 'pourpre', 'incandes', 'etincelle', 'eclair', 'foudre',
    'explos', 'deton', 'consum', 'devor', 'fievre', 'fougue', 'brasi',
    'volcan', 'lave', 'magma', 'eruption', 'torche', 'allum', 'embras', 'crepit',
  ],
  nuit: [
    'nuit', 'nocturne', 'minuit', 'ombre', 'ombrag', 'sombre', 'obscur', 'tenebr', 'noir',
    'penombre', 'crepuscul', 'soiree', 'lune', 'lunaire', 'etoile', 'astre', 'constell',
    'dormir', 'sommeil', 'endorm', 'reve', 'songe', 'cauchemar', 'insomnie',
    'aveugle', 'invisible', 'dissimul', 'secret', 'mystere', 'enigme', 'occulte',
    'gouffre', 'abime', 'souterrain', 'tunnel', 'grotte', 'antre', 'caverne',
    'glacial', 'sinistre', 'lugubre', 'spectre', 'fantome', 'hante', 'sortileg',
  ],
  lumiere: [
    'lumiere', 'lumineu', 'clart', 'clair', 'eclat', 'brill', 'luisant',
    'aube', 'aurore', 'matin', 'journee', 'diurne',
    'blanc', 'blanch', 'dore', 'argent', 'cristal', 'diamant', 'miroir', 'reflet',
    'transparen', 'limpide', 'purete', 'nettet', 'vif', 'radieu', 'rayon',
    'illumin', 'scintill', 'etincel', 'flamboy', 'resplend', 'halo', 'aureol', 'phare',
    'espoir', 'esperance', 'promesse', 'renouveau', 'printemps', 'eblou',
  ],
  nature: [
    'arbre', 'foret', 'bois', 'branche', 'feuille', 'racine', 'tronc', 'ecorce', 'sylve',
    'herbe', 'prairie', 'champ', 'jardin', 'verger', 'fleur', 'petale', 'bourgeon',
    'montagne', 'colline', 'vallee', 'plaine', 'sommet', 'roche', 'pierre', 'falaise',
    'oiseau', 'aile', 'nid', 'plume', 'insecte', 'abeille', 'papillon', 'hirondelle',
    'animal', 'bete', 'cheval', 'loup', 'cerf', 'renard', 'sanglier', 'chouette',
    'terre', 'boue', 'argile', 'graine', 'germe', 'pousse', 'floraison', 'verdur',
    'vert', 'mousse', 'lierre', 'saison', 'automne', 'hiver', 'recolte', 'moisson',
    'brise', 'horizon', 'paysage', 'sauvage', 'clairiere', 'sentier',
  ],
  violence: [
    'guerre', 'combat', 'bataille', 'lutte', 'affront', 'assaut', 'attaqu', 'agress',
    'arme', 'fusil', 'canon', 'balle', 'lame', 'couteau', 'epee', 'poignard', 'bombe',
    'sang', 'sanglant', 'blessu', 'bless', 'plaie', 'cicatr', 'meurtr', 'tuer',
    'frapp', 'brutal', 'violen', 'cogn', 'briser', 'fractur', 'lacer',
    'colere', 'rage', 'fureur', 'furie', 'haine', 'venge', 'cruel', 'cruaut',
    'hurl', 'rugi', 'gronde', 'menace', 'terreur', 'terrifi', 'effroi', 'panique',
    'detru', 'destruct', 'ravag', 'saccag', 'ruine', 'ecras', 'anean', 'massacr',
    'craint', 'angoiss', 'horreur', 'monstre', 'ennemi', 'traitre', 'supplice',
  ],
  amour: [
    'amour', 'aimer', 'amant', 'amoureu', 'cheri', 'bien-aim', 'ador',
    'tendre', 'tendress', 'douceur', 'caress', 'etreint', 'enlac',
    'baiser', 'embrass', 'levre', 'coeur', 'desir', 'volupt',
    'couple', 'complice', 'confiance', 'fidel', 'serment', 'epous',
    'ami', 'amiti', 'affection', 'attach', 'intime',
    'famille', 'mere', 'pere', 'enfant', 'fils', 'fille', 'frere', 'soeur', 'berc',
    'beaut', 'belle', 'grace', 'charme', 'seduire', 'sourire', 'chaleureu',
  ],
  mort: [
    'mort', 'mour', 'decede', 'defunt', 'cadavre', 'depouille', 'tombe', 'tombeau',
    'cimetiere', 'sepulture', 'enterr', 'inhum', 'cercueil', 'linceul', 'urne',
    'deuil', 'endeuil', 'veuve', 'orphelin', 'perte', 'perdu', 'perdre', 'disparu',
    'adieu', 'ultime', 'fin', 'finir', 'achever', 'cesser', 'expire',
    'neant', 'vide', 'absence', 'absent', 'oubli',
    'agonie', 'agonis', 'mourant', 'eteindre', 'extinct', 'funebre', 'funeraire',
    'squelette', 'crane', 'mortel', 'peris', 'trepas',
  ],
  joie: [
    'joie', 'joyeu', 'rire', 'gaiet', 'gaie',
    'heureu', 'bonheur', 'ravi', 'raviss', 'enchant', 'jubil', 'exult', 'allegresse',
    'fete', 'festi', 'celebr', 'danse', 'chant', 'melodi',
    'jouer', 'amus', 'plaisir', 'delice', 'regal', 'savour',
    'euphor', 'extase', 'triomph', 'victoire', 'gagner', 'reussi', 'succes',
    'libert', 'envol', 'bondir', 'sauter', 'ivresse',
    'cadeau', 'merveill', 'magnifi', 'splendid', 'eclore',
  ],
  tristesse: [
    'triste', 'tristess', 'chagrin', 'peine', 'douleur', 'souffr',
    'pleur', 'larme', 'sanglot', 'gemis', 'plainte', 'lament',
    'seul', 'solitud', 'isole', 'abandon', 'delaiss', 'rejet',
    'melancoli', 'nostalgi', 'regret', 'remord', 'amertume',
    'desespoir', 'desesper', 'decourag', 'accabl', 'abattu', 'lasse', 'fatigu',
    'gris', 'terne', 'morne', 'blafard', 'maussade',
    'echec', 'sombrer', 'malheur', 'infortune', 'detresse',
    'honte', 'culpab', 'pitie', 'soupir',
  ],
  temps: [
    'temps', 'heure', 'minute', 'seconde', 'instant', 'moment', 'duree', 'siecle',
    'annee', 'semaine', 'hier', 'demain', 'aujourd', 'autrefois', 'jadis', 'naguere',
    'avenir', 'eternel', 'eternit', 'infini',
    'souven', 'memoire', 'rappel', 'reminisc',
    'attendre', 'attente', 'patience', 'lenteur', 'tarder',
    'vieil', 'vieux', 'vieill', 'ancien', 'antique', 'archaiq', 'ancetre',
    'histoire', 'epoque', 'cycle', 'recommenc', 'horloge', 'pendule', 'calendrier',
    'usure', 'fane', 'vetuste', 'ride', 'ephemere',
  ],
  ville: [
    'ville', 'urbain', 'cite', 'quartier', 'banlieue', 'faubourg', 'agglomer',
    'rue', 'avenue', 'boulevard', 'ruelle', 'trottoir', 'carrefour',
    'immeuble', 'gratte-ciel', 'facade', 'beton', 'bitume', 'asphalte',
    'foule', 'passant', 'affluence', 'cohue', 'anonymat',
    'metro', 'tramway', 'circulation', 'embouteil', 'klaxon', 'trafic',
    'usine', 'atelier', 'chantier', 'entrepot', 'hangar',
    'bureau', 'travail', 'boulot', 'salaire', 'patron', 'dossier',
    'magasin', 'boutique', 'commerce', 'vitrine', 'enseigne', 'publicit',
    'vacarme', 'tapage', 'pollution', 'neon', 'lampadaire',
  ],
  machine: [
    'machine', 'moteur', 'mecani', 'engrenage', 'rouage', 'piston', 'turbine',
    'ordinateur', 'ecran', 'clavier', 'processeur', 'circuit', 'puce',
    'code', 'coder', 'program', 'algorithm', 'variable', 'donnee', 'fichier',
    'reseau', 'internet', 'connexi', 'serveur', 'numeriq', 'logiciel',
    'robot', 'automate', 'artificiel', 'calcul', 'binaire',
    'electr', 'cable', 'transistor', 'batterie',
    'signal', 'frequence', 'antenne', 'satellite', 'capteur', 'radar',
    'metal', 'acier', 'alliage', 'plastique', 'industriel', 'rouille',
    'systeme', 'protocole', 'interface', 'module', 'commande',
  ],
  corps: [
    'corps', 'main', 'doigt', 'paume', 'poing', 'bras', 'epaule', 'coude',
    'jambe', 'pied', 'genou', 'cheville', 'talon', 'marcher', 'demarche',
    'visage', 'front', 'joue', 'oeil', 'yeux', 'regard', 'paupiere',
    'bouche', 'dent', 'gorge', 'voix', 'parler', 'murmure',
    'peau', 'chair', 'muscle', 'nerf', 'veine', 'pouls', 'echine',
    'souffle', 'respir', 'poumon', 'haleine', 'essouffl', 'poitrine',
    'oreille', 'entendre', 'ecouter', 'toucher', 'odeur', 'parfum',
    'faim', 'soif', 'manger', 'boire', 'reveil', 'geste', 'nuque',
  ],
  voyage: [
    'voyage', 'partir', 'depart', 'quitter', 'revenir', 'retour',
    'route', 'chemin', 'piste', 'trajet', 'itineraire', 'parcours',
    'loin', 'lointain', 'ailleurs', 'la-bas', 'distance', 'eloign',
    'train', 'gare', 'avion', 'aeroport', 'voiture', 'valise', 'bagage',
    'errer', 'errance', 'vagabond', 'nomade', 'exil', 'fuir', 'fuite', 'echapp',
    'frontiere', 'pays', 'etranger', 'contree', 'region', 'territoire',
    'arrivee', 'atteindre', 'rejoindre', 'traverser', 'franchir', 'escale',
    'aventure', 'explor', 'decouvr', 'quete', 'destin', 'periple',
  ],
  silence: [
    'silence', 'silencieu', 'muet', 'taire', 'chut', 'calme', 'calmer',
    'paix', 'paisible', 'serein', 'serenit', 'tranquil', 'quietude', 'repos',
    'immobile', 'immobil', 'fige', 'statique', 'suspendu',
    'chuchot', 'feutre', 'ouate', 'assourd',
    'espace', 'etendue', 'vaste', 'immens', 'ampleur',
    'contempl', 'meditat', 'recueil', 'priere', 'sacre', 'temple', 'monastere',
    'neutre', 'lisse', 'constant', 'stable', 'egalite',
    'apais', 'adouc', 'somnol', 'langueur', 'torpeur',
  ],
}

// Index racine -> champ, construit une fois au chargement du module.
const STEMS = new Map<string, SemanticField>()
for (const [field, stems] of Object.entries(STEM_GROUPS) as [SemanticField, string[]][]) {
  for (const stem of stems) {
    const key = stem.trim()
    // Une racine deja prise n'est pas ecrasee : le premier champ declare gagne,
    // ce qui rend l'index independant de l'ordre d'iteration.
    if (key.length >= 2 && !STEMS.has(key)) STEMS.set(key, field)
  }
}

// Retire les accents pour que le lexique reconnaisse un texte tape sans.
export function normalize(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const MIN_PREFIX = 4

// Champ d'un mot : correspondance exacte d'abord, puis la plus longue racine
// qui le prefixe. Le seuil de quatre lettres evite les faux positifs.
export function fieldOf(word: string): SemanticField | null {
  const w = normalize(word)
  const exact = STEMS.get(w)
  if (exact) return exact
  for (let length = Math.min(w.length, 14); length >= MIN_PREFIX; length--) {
    const field = STEMS.get(w.slice(0, length))
    if (field) return field
  }
  return null
}

export interface SemanticProfile {
  // Part des mots rattaches a un champ [0..1] : mesure la confiance a
  // accorder au profil.
  coverage: number
  // Poids de chaque champ rencontre, normalise sur les mots reconnus.
  weights: Partial<Record<SemanticField, number>>
  // Champs dominants, du plus present au moins present.
  dominant: SemanticField[]
  valence: number
  arousal: number
  space: number
  tension: number
}

export function profileOf(words: string[]): SemanticProfile {
  const counts = new Map<SemanticField, number>()
  let matched = 0
  for (const word of words) {
    const field = fieldOf(word)
    if (!field) continue
    counts.set(field, (counts.get(field) ?? 0) + 1)
    matched++
  }

  const empty: SemanticProfile = {
    coverage: 0,
    weights: {},
    dominant: [],
    valence: 0,
    arousal: 0,
    space: 0,
    tension: 0,
  }
  if (matched === 0) return empty

  const weights: Partial<Record<SemanticField, number>> = {}
  let valence = 0
  let arousal = 0
  let space = 0
  let tension = 0
  for (const [field, count] of counts) {
    const weight = count / matched
    weights[field] = weight
    const trait = FIELD_TRAITS[field]
    valence += trait.valence * weight
    arousal += trait.arousal * weight
    space += trait.space * weight
    tension += trait.tension * weight
  }

  const dominant = [...counts.entries()]
    // A egalite, l'ordre alphabetique tranche : le profil ne depend pas de
    // l'ordre d'apparition des mots dans le texte.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field]) => field)

  return {
    coverage: matched / Math.max(words.length, 1),
    weights,
    dominant,
    valence,
    arousal,
    space,
    tension,
  }
}

// Signature des deux champs dominants. C'est elle qui rend deux textes de meme
// sujet reconnaissables entre eux : elle pilote la gamme et les timbres,
// tandis que le rythme et la forme restent tires de la surface du texte.
export function signatureOf(profile: SemanticProfile): number {
  if (profile.dominant.length === 0) return 0
  const order = Object.keys(FIELD_TRAITS) as SemanticField[]
  const first = order.indexOf(profile.dominant[0]) + 1
  const second = profile.dominant.length > 1 ? order.indexOf(profile.dominant[1]) + 1 : 0
  return first * 31 + second
}
