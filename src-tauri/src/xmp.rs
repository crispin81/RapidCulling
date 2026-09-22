use std::path::Path;

#[derive(Clone, Copy, Debug)]
pub struct RatingFlags {
    /// -1 = rejected, 0 = none, 1-5 = stars.
    pub rating: i8,
    pub pick: bool,
}

impl Default for RatingFlags {
    fn default() -> Self {
        Self { rating: 0, pick: false }
    }
}

const RAPIDCULLING_NS: &str = "https://rapidculling.chriscorkphotography.co.uk/ns/1.0/";

/// Reads the handful of fields we care about out of a sidecar's XMP packet.
/// The format is a small, fixed RDF/XML shape we write ourselves (see
/// `write`), so simple attribute extraction is enough - no general XML
/// parser dependency needed. Missing file or fields just means defaults.
pub fn read(xmp_path: &Path) -> RatingFlags {
    let Ok(contents) = std::fs::read_to_string(xmp_path) else {
        return RatingFlags::default();
    };

    let rating = extract_attr(&contents, "xmp:Rating")
        .and_then(|v| v.parse::<i8>().ok())
        .unwrap_or(0);
    let pick = extract_attr(&contents, "rapidculling:Pick")
        .map(|v| v == "true")
        .unwrap_or(false);

    RatingFlags { rating, pick }
}

fn extract_attr<'a>(xml: &'a str, attr: &str) -> Option<&'a str> {
    let needle = format!("{}=\"", attr);
    let start = xml.find(&needle)? + needle.len();
    let end = xml[start..].find('"')? + start;
    Some(&xml[start..end])
}

/// Writes a minimal, valid XMP sidecar packet carrying the standard
/// `xmp:Rating` field (1-5 stars, -1 for Reject - the convention
/// Lightroom/Bridge/Capture One honor on import) plus a custom-namespace
/// `Pick` boolean, since no universal standard field exists for that flag.
/// Unknown namespaces are safely ignored by other XMP readers.
pub fn write(xmp_path: &Path, flags: RatingFlags) -> Result<(), String> {
    let packet = format!(
        r#"<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:rapidculling="{ns}"
      xmp:Rating="{rating}"
      rapidculling:Pick="{pick}"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
"#,
        ns = RAPIDCULLING_NS,
        rating = flags.rating,
        pick = flags.pick,
    );

    std::fs::write(xmp_path, packet).map_err(|e| e.to_string())
}

pub fn sidecar_path_for(raw_path: &Path) -> std::path::PathBuf {
    raw_path.with_extension("xmp")
}
