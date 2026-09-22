use crate::preview::hamming_distance;

#[derive(Clone, Debug)]
pub struct GroupInput {
    pub path: String,
    pub timestamp_ms: i64,
    pub phash: u64,
}

/// Two unrelated images land around 32 differing bits apart in a 64-bit
/// dHash by chance alone, so that's the principled "0% visually alike"
/// reference point rather than an arbitrary one.
const HASH_HALF_BITS: f64 = 32.0;

/// Reference timescale for the exponential time-closeness decay: at this
/// gap, closeness has fallen to ~37% (1/e). Carried over from the old
/// fixed "time gap" default as a reasonable typical-burst-cadence anchor.
const TIME_TAU_MS: f64 = 1500.0;

/// Combined 0-1 similarity between two temporally-adjacent photos: visual
/// similarity (from perceptual hash distance) and time closeness
/// (exponential decay of the capture-time gap), multiplied together so a
/// pair only scores high when it's close in *both* time and content - a
/// visually-identical frame from minutes later, or a totally different
/// frame a moment later, both score low.
fn pair_similarity(prev: &GroupInput, cur: &GroupInput) -> f64 {
    if prev.timestamp_ms == 0 || cur.timestamp_ms == 0 {
        return 0.0;
    }
    let dt_ms = (cur.timestamp_ms - prev.timestamp_ms).max(0) as f64;
    let time_closeness = (-dt_ms / TIME_TAU_MS).exp();

    let hash_dist = hamming_distance(prev.phash, cur.phash) as f64;
    let visual_similarity = (1.0 - hash_dist / HASH_HALF_BITS).clamp(0.0, 1.0);

    visual_similarity * time_closeness
}

/// Single O(n) pass over photos sorted by capture time. A new group starts
/// whenever the combined similarity to the previous photo, as a percentage,
/// drops below `similarity_percent`. Each photo is only ever compared to its
/// immediate temporal neighbor, never pairwise across the whole library, so
/// this stays cheap on large folders.
pub fn group_photos(mut photos: Vec<GroupInput>, similarity_percent: f64) -> Vec<Vec<String>> {
    photos.sort_by_key(|p| p.timestamp_ms);

    let mut groups: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    let mut prev: Option<&GroupInput> = None;

    for photo in &photos {
        let starts_new_group = match prev {
            None => false,
            Some(p) => pair_similarity(p, photo) * 100.0 < similarity_percent,
        };

        if starts_new_group && !current.is_empty() {
            groups.push(std::mem::take(&mut current));
        }
        current.push(photo.path.clone());
        prev = Some(photo);
    }

    if !current.is_empty() {
        groups.push(current);
    }

    groups
}
