# Echo

Echo transforme un texte ou une image en une pièce sonore générée algorithmiquement, entièrement dans le navigateur. Aucune IA générative, aucun serveur, aucune donnée transmise : la sonification est un mapping déterministe entre les caractéristiques de l'entrée et des paramètres musicaux.

## Principe

1. Vous saisissez un texte ou déposez une image (JPEG, PNG, WEBP, 12 Mo max).
2. L'algorithme de sonification analyse l'entrée et produit une séquence d'événements musicaux (notes, durées, vélocités) et des réglages d'effets.
3. La séquence est rendue hors-ligne par Tone.js (Web Audio API) en un buffer audio.
4. Vous écoutez le résultat dans le lecteur intégré (forme d'onde cliquable, volume), puis le téléchargez en MP3, FLAC, WAV ou OGG via ffmpeg.wasm, exécuté localement.

Le même contenu produit toujours exactement le même son.

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

Chaque génération produit un arrangement complet de six couches : mélodie, nappes d'accords, arpèges, basse, grosse caisse et charley, toutes dérivées du contenu. Les entrées courtes sont rejouées en deux passages (forme A / A', le second plus doux) pour garder une vraie forme musicale.

Les timbres reposent sur la synthèse FM (mélodie avec vibrato, basse ronde, arpège cristallin) et une nappe à oscillateurs désaccordés élargie en stéréo. Chaque événement subit une micro-variation déterministe de placement et de vélocité (humanisation reproductible : l'historique régénère un son strictement identique), et le mixage passe par un compresseur de bus, une réverbération longue, delay, chorus et limiteur.

### Texte

| Caractéristique du texte | Paramètre musical |
| --- | --- |
| Lettres de chaque mot (hash stable) | Hauteur de la note, sur une échelle consonante |
| Longueur du mot | Durée de la note |
| Longueur moyenne des mots | Tempo |
| Ratio de voyelles, densité de questions | Choix de l'échelle (pentatonique majeure/mineure, dorien, lydien) |
| Première lettre du texte | Tonique |
| Virgules, points, points d'exclamation | Silences courts/longs, accents de vélocité |
| Points d'interrogation | La note suivante monte d'une octave |
| Sauts de ligne | Changement de registre (octave) |
| Mots répétés | Écho harmonique une quinte au-dessus |
| Hash des mots de chaque phrase | Accord de la phrase (progression consonante, la première phrase pose la tonique) : nappe tenue, basse fondamentale/quinte, arpège continu en croches |
| Hash global du texte | Motif de l'arpège |
| Densité d'exclamations et tempo | Énergie des percussions (grosse caisse sur les temps forts, charley en croches) |
| Longueur des phrases | Quantité de réverbération |
| Taux de répétition du vocabulaire | Quantité et feedback du delay |
| Richesse du vocabulaire | Ouverture du filtre passe-bas |

La durée est plafonnée à 75 secondes pour les très longs textes.

### Image

L'image est réduite en une grille de 64 colonnes par 6 lignes, balayée de gauche à droite (une colonne = un pas de temps, environ 15 secondes au total).

| Caractéristique de l'image | Paramètre musical |
| --- | --- |
| Teinte moyenne d'une colonne | Hauteur de la note |
| Luminosité moyenne d'une colonne | Vélocité (une colonne presque noire = silence) |
| Saturation moyenne d'une colonne | Durée de la note mélodique et vélocité de l'arpège |
| Teinte dominante de chaque segment de 16 colonnes | Accord du segment : nappe tenue, basse fondamentale/quinte, arpège continu en double-croches |
| Ruptures de luminosité entre colonnes voisines | Accents de charley, coups de grosse caisse supplémentaires |
| Teinte dominante de l'image | Échelle : chaud = majeur, vert = dorien, bleu = mineur, violet = lydien |
| Contraste global | Ouverture du filtre passe-bas |
| Saturation globale | Réverbération et chorus |
| Dispersion des teintes | Delay |

Les colonnes identiques consécutives (aplats) prolongent la note au lieu de la répéter. Le balayage complet est ensuite rejoué en un second passage plus doux.

## Formats d'export

- **MP3** (192 kbit/s, libmp3lame)
- **FLAC** (sans perte)
- **WAV** (PCM 16 bits, sans conversion)
- **OGG** (Vorbis, qualité 6)

La conversion est effectuée par ffmpeg.wasm, servi localement (`public/ffmpeg/`) : la première conversion charge environ 30 Mo, puis le moteur reste en mémoire.

## Historique

Chaque génération réussie est enregistrée en localStorage (20 entrées max) sous forme de séquence musicale complète : sélectionner une entrée régénère un audio strictement identique, sans conserver le texte ou l'image d'origine. L'historique s'ouvre depuis le bouton en haut à droite et se vide depuis le tiroir.

## Stack

- Vite + React + TypeScript
- Tailwind CSS 4
- Tone.js (synthèse et rendu hors-ligne)
- lucide-react (icônes vectorielles)
- @ffmpeg/ffmpeg + @ffmpeg/core (export multi-format)
- nginx (service statique en Docker)

## Structure

```
src/
  components/   interface (logo, toggle, saisie, ligne d'onde,
                lecteur, export, tiroir historique)
  hooks/        lecture audio (useAudioPlayer)
  lib/          sonification texte et image, rendu Tone.Offline,
                encodage WAV, export ffmpeg, historique localStorage
public/
  ffmpeg/       binaire ffmpeg-core servi localement (pas de CDN)
```
