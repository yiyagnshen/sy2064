use super::types::{RenameParams, VideoFile};

pub fn render_file_name(template: &str, file: &VideoFile, index: usize, params: &RenameParams) -> String {
    let mut stem = template.to_string();
    let padded_index = format!("{:03}", index);

    stem = stem.replace("{date}", params.date.trim());
    stem = stem.replace("{country}", params.country.trim());
    stem = stem.replace("{material}", params.material.trim());
    stem = stem.replace("{product}", params.material.trim());
    stem = stem.replace("{resolution}", params.resolution.trim());
    stem = stem.replace("{version}", params.version.trim());
    stem = stem.replace("{platform}", params.platform.trim());
    stem = stem.replace("{index}", &padded_index);
    stem = stem.replace("{origin}", &file.stem);

    stem = compact_separators(&stem);

    if stem.trim().is_empty() {
        stem = file.stem.clone();
    }

    format!("{}.{}", sanitize_file_name(&stem), file.extension)
}

fn compact_separators(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_separator = false;

    for character in value.chars() {
        if character == '_' {
            if !last_was_separator {
                output.push(character);
            }
            last_was_separator = true;
        } else {
            output.push(character);
            last_was_separator = false;
        }
    }

    output.trim_matches('_').to_string()
}

fn sanitize_file_name(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect()
}
