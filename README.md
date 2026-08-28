# Echo

Echo transforme un texte ou une image en une pièce sonore générée algorithmiquement, entièrement dans le navigateur. Aucune IA générative, aucun serveur, aucune donnée transmise : la sonification est un mapping déterministe entre les caractéristiques de l'entrée et une intention musicale.

## Principe

1. Vous saisissez un texte ou déposez une image (JPEG, PNG, WEBP, 12 Mo max).
2. L'analyse extrait une vingtaine de caractéristiques de l'entrée et les condense en un **brief** : une couleur affective, une énergie, une densité, une tension, un espace, une ligne mélodique et une progression harmonique. Pour un texte, un lexique de champs sémantiques ajoute ce dont le texte *parle* à ce dont il a l'air.
3. Le moteur de composition traduit ce brief en patterns [Strudel](https://strudel.cc/), le portage JavaScript du langage de live coding TidalCycles. Les patterns sont ensuite interrogés hors du temps pour produire la liste des événements musicaux.
4. La séquence est rendue hors-ligne par Tone.js (Web Audio API) en un buffer audio.
5. Vous écoutez le résultat dans le lecteur intégré (forme d'onde cliquable, volume), puis le téléchargez en MP3, FLAC, WAV ou OGG via ffmpeg.wasm, exécuté localement.

Le même contenu produit toujours exactement le même son.

Strudel n'est utilisé ici que comme **langage de composition**. Son moteur audio (superdough) n'est jamais chargé : pas de samples, pas de requête réseau, pas de `eval`. Les patterns sont construits par l'API JavaScript et interrogés par `queryArc`, ce qui est du calcul pur.

## Interface

L'application se déroule en trois écrans, sur un fond nocturne aux halos dérivants :

1. **Saisie** - le champ de texte ou la zone de dépôt d'image, en verre translucide, seuls au centre de l'écran.
2. **Génération** - une ligne d'onde lumineuse ondule au centre pendant le rendu audio.
3. **Résultat** - le lecteur (forme d'onde cliquable, volume) et les boutons de téléchargement.

L'historique est discret : il n'apparaît pas au chargement, mais un bouton en haut à droite ouvre un tiroir latéral qui glisse par-dessus la scène.

## Lancer avec Docker (recommandé)

```bash
docker compose up
```

L'application est disponible sur **http://localhost:8080** (port configurable dans `docker-compose.yml`). Le build est multi-stage : compilation Node + pnpm, puis service statique nginx avec fallback SPA.

## Lancer sans Docker

Prérequis : Node 24+ et pnpm (`npm install -g pnpm`).

```bash
pnpm install
pnpm run dev        # serveur de developpement (http://localhost:5173)
pnpm run build      # build de production dans dist/
pnpm run preview    # sert le build de production en local
```

## Sonification : le mapping

### Les six leviers de diversité

Deux entrées différentes ne produisent pas la même pièce transposée : elles divergent sur six axes indépendants, chacun piloté par des caractéristiques distinctes du contenu.

| Levier | Amplitude | Piloté par |
| --- | --- | --- |
| **Style** | 6 archétypes d'arrangement | l'énergie du contenu |
| **Gamme** | 24 échelles | la couleur affective |
| **Tonique** | 12 hauteurs | première lettre / teinte dominante |
| **Métrique** | 3 à 7 temps par cycle | le style et un hash |
| **Forme** | 6 arcs d'intensité | un hash de la structure |
| **Timbres** | 5 patches de mélodie, 4 de nappe, 4 de basse, 4 d'arpège, 3 de percussion | le style et des hashes indépendants |

Les six hashes utilisés sont des projections **indépendantes** du contenu (les lettres, les longueurs de mots, le vocabulaire trié, la ponctuation seule…), pour que deux entrées voisines ne basculent pas ensemble sur tous les critères.

### Les six styles

| Style | Tempo | Caractère |
| --- | --- | --- |
| **nocturne** | 56-74 | nappes dominantes, mélodie éparse, sans percussion appuyée, réverbération longue |
| **houle** | 68-88 | basse ample, delay profond avec réaction, nappes qui enflent |
| **carillon** | 88-116 | pincé et minimal, métriques impaires (5 ou 7 temps), grand espace |
| **cascade** | 98-126 | arpèges rapides dédoublés en stéréo, cloches, percussions légères |
| **fracture** | 86-108 | rythmes euclidiens irréguliers, charley dégradé, mélodie hachée |
| **pulsation** | 116-134 | grosse caisse sur chaque temps, basse motrice, charley serré |

### Texte

| Caractéristique du texte | Effet musical |
| --- | --- |
| Exclamations, majuscules, brièveté des mots, chiffres | **Énergie** - choisit le style, le tempo, la densité des percussions |
| Ratio de voyelles, questions, points de suspension, accents | **Couleur** - choisit la gamme parmi les 24 |
| Richesse du vocabulaire, longueur des phrases | **Densité** - nombre de voix, ouverture du filtre, chorus, dédoublement stéréo de l'arpège |
| Densité de virgules, questions, irrégularité des longueurs de mots | **Tension** - progression harmonique, écho de la mélodie, réaction du delay |
| Longueur des phrases, suspensions, paragraphes | **Espace** - réverbération, delay, élargissement des nappes |
| Champ sémantique dominant | **Gamme** et signature des timbres |
| Vocabulaire affectif du texte | Infléchit couleur, énergie, tension et espace |
| Première lettre + hash global | Tonique |
| Lettres de chaque mot (hash stable) | Hauteur de la note |
| Longueur du mot | Durée de la note |
| Virgules, points, points d'exclamation | Silences courts/longs, accents de vélocité |
| Points d'interrogation | La note suivante monte d'une octave |
| Sauts de ligne | Changement de registre |
| Mots répétés | Le degré est décalé d'une quinte : le vocabulaire répété devient un motif |
| Hash de chaque phrase | Accord de la section |

La durée est plafonnée à 75 secondes.

### Image

L'image est réduite en une grille de 96 colonnes par 8 lignes, balayée de gauche à droite.

| Caractéristique de l'image | Effet musical |
| --- | --- |
| Énergie des contours, texture verticale, contraste global | **Énergie** - style, tempo, percussions |
| Chaleur de la teinte dominante, luminosité, saturation | **Couleur** - gamme |
| Dispersion des teintes, saturation | **Densité** |
| Dispersion des teintes, irrégularité des contours, gradient gauche-droite | **Tension** |
| Faible contraste, faible saturation | **Espace** - réverbération, delay |
| Teinte dominante | Tonique |
| Teinte, luminosité et texture d'une colonne | Hauteur de la note |
| Luminosité d'une colonne | Vélocité |
| Colonnes voisines semblables | Les aplats prolongent la note au lieu de la répéter |
| Colonnes les plus sombres de l'image | Silences |
| Texture verticale marquée | La note monte d'une octave |
| Six bandes verticales | Progression harmonique |

La hauteur est lue sur trois axes - teinte, luminosité, texture - **mélangés au prorata de ce que chacun varie réellement dans cette image**. Un paysage coloré fait chanter sa teinte ; une photo en noir et blanc, où la teinte ne veut rien dire, fait chanter sa luminosité. Chaque axe est normalisé sur sa propre étendue, pour qu'une image aux nuances subtiles déploie autant d'ambitus qu'une image franchement contrastée.

### Le sens du texte

L'analyse de forme lit la ponctuation, la longueur des mots, les majuscules - elle ne sait rien du sujet. Un lexique de 16 champs sémantiques (`eau`, `feu`, `nuit`, `lumière`, `nature`, `violence`, `amour`, `mort`, `joie`, `tristesse`, `temps`, `ville`, `machine`, `corps`, `voyage`, `silence`) et de près de 800 racines ajoute cette dimension.

Chaque champ porte une intention musicale - une couleur, une agitation, une ampleur, une instabilité - et une famille de trois gammes. Le champ dominant du texte choisit la gamme et signe les timbres ; le rythme, la métrique et la forme restent tirés de la surface du texte.

Conséquence : **deux textes sur le même sujet sonnent comme des cousins sans sonner pareil.**

| Texte | Gamme retenue |
| --- | --- |
| la guerre, le sang, la terreur | phrygienne, altérée, locrienne - les plus sombres de la palette |
| le rire, la fête, la victoire | lydien, pentatonique majeure - les plus lumineuses |
| la mer, l'écume, la houle | kumoi, ritusen, égyptienne |
| la tombe, le deuil, l'adieu | iwato, mineure harmonique, phrygienne |
| le code, le réseau, le processeur | ton par ton, augmentée, altérée |

Le profil pèse à proportion des mots reconnus : un texte sans vocabulaire marqué - un compte rendu de réunion, du code - retombe intégralement sur l'analyse de surface, exactement comme si le lexique n'existait pas.

Ce lexique est écrit pour cette application : c'est une correspondance mot → intention musicale, pas un relevé de normes psychométriques. Les lexiques affectifs publiés (NRC, FEEL) interdisent explicitement la redistribution, ce qui les rend inutilisables dans un dépôt public.

### Forme

Une pièce n'est pas un bloc homogène : elle suit un arc d'intensité découpé en six sections. Les voix entrent et sortent selon le niveau de chaque section, des nappes seules jusqu'au tutti. Quand le matériau mélodique est pauvre - un mot unique, un aplat de couleur - la ligne suit la progression harmonique au lieu de rester figée sur une hauteur.

### Registres

Les degrés d'une gamme s'additionnent naturellement vers l'aigu - accord de la section, puis figure de la voix, puis décalage d'octave - et sans garde-fou chaque voix finit par quitter le registre où elle sonne. Chaque voix replie donc ses degrés dans une fenêtre de registre, ce qui préserve l'harmonie tout en la maintenant à sa place : basse à l'octave 1-2, nappes au bas-médium, mélodie au médium, arpège juste au-dessus. La basse et la fondamentale des nappes sont doublées à l'octave inférieure pour l'assise.

Résultat mesuré sur un échantillon de textes et d'images : un tiers des notes mélodiques au-dessus de C5, réparties sur six octaves, contre 70 % concentrées dans l'aigu sans ce repliement.

## Formats d'export

- **MP3** (192 kbit/s, libmp3lame)
- **FLAC** (sans perte)
- **WAV** (PCM 16 bits, sans conversion)
- **OGG** (Vorbis, qualité 6)

La conversion est effectuée par ffmpeg.wasm, servi localement (`public/ffmpeg/`) : la première conversion charge environ 30 Mo, puis le moteur reste en mémoire.

## Historique

Chaque génération réussie est enregistrée en localStorage (20 entrées max) sous forme de **brief** : l'intention musicale extraite du contenu, quelques kilo-octets, sans le texte ni l'image d'origine. Sélectionner une entrée recompose et régénère un audio strictement identique. L'historique s'ouvre depuis le bouton en haut à droite et se vide depuis le tiroir.

## Stack

- Vite + React + TypeScript
- Tailwind CSS 4
- `@strudel/core`, `@strudel/mini`, `@strudel/tonal` (langage de composition)
- Tone.js (synthèse et rendu hors-ligne)
- lucide-react (icônes vectorielles)
- `@ffmpeg/ffmpeg` + `@ffmpeg/core` (export multi-format)
- nginx (service statique en Docker)

## Structure

```
src/
  components/   interface (logo, toggle, saisie, ligne d'onde,
                lecteur, export, tiroir historique)
  hooks/        lecture audio (useAudioPlayer)
  lib/
    sequence.ts           types partages (evenements, timbres, effets)
    strudel.ts            pont Strudel : compile(), 24 gammes, gammes par champ
    lexicon.ts            16 champs semantiques, ~800 racines francaises
    compose.ts            moteur de composition : styles, forme, timbres
    textSonification.ts   analyse d'un texte -> brief
    imageSonification.ts  analyse d'une image -> brief
    renderAudio.ts        rendu Tone.Offline
    wav.ts                encodage WAV
    ffmpegExport.ts       export multi-format
    history.ts            historique localStorage
  types/        declarations TypeScript pour @strudel/*
public/
  ffmpeg/       binaire ffmpeg-core servi localement (pas de CDN)
```

## Licence

Echo dépend de Strudel, distribué sous **AGPL-3.0-or-later**. L'application est donc publiée sous la même licence : voir [LICENSE](LICENSE). Les sources sont disponibles sur https://github.com/RobinHil/echo.
