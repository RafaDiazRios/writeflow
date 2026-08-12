//! Cifrado extremo a extremo para WriteFlow.
//!
//! Modelo: la frase de paso NUNCA sale del dispositivo. De ella se deriva una
//! clave de 32 bytes con Argon2id y con esa clave se cifra con AES-256-GCM el
//! contenido de las entradas antes de enviarlo a Supabase. El servidor guarda
//! únicamente ciphertext + metadatos no sensibles (fechas, contadores, revisión).

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
/// Prefijo de formato del payload cifrado. Si algún día cambia el esquema,
/// se incrementa y se mantiene compatibilidad hacia atrás.
const FORMAT: &str = "wf1";

fn argon2() -> Result<Argon2<'static>, String> {
    // 64 MiB, 3 pasadas, 1 hilo: coste razonable en un portátil y muy caro de
    // atacar por fuerza bruta.
    let params = Params::new(64 * 1024, 3, 1, Some(KEY_LEN)).map_err(|e| e.to_string())?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Genera una sal aleatoria nueva (base64). Se guarda junto al perfil del
/// usuario y se sincroniza: es pública, no es un secreto.
#[tauri::command]
pub fn crypto_new_salt() -> String {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    B64.encode(salt)
}

/// Deriva la clave maestra a partir de la frase de paso y la sal.
/// Devuelve la clave en base64: se mantiene en memoria del proceso, nunca en disco.
#[tauri::command]
pub fn crypto_derive_key(passphrase: String, salt_b64: String) -> Result<String, String> {
    let salt = B64.decode(salt_b64.trim()).map_err(|e| e.to_string())?;
    if salt.len() < 8 {
        return Err("La sal es demasiado corta".into());
    }
    let mut key = [0u8; KEY_LEN];
    argon2()?
        .hash_password_into(passphrase.as_bytes(), &salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(B64.encode(key))
}

/// Huella de verificación de la clave. Se guarda en el servidor para poder
/// avisar «frase de paso incorrecta» sin que el servidor pueda deducir la clave.
#[tauri::command]
pub fn crypto_key_fingerprint(key_b64: String) -> Result<String, String> {
    let key = B64.decode(key_b64.trim()).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(b"writeflow-key-verify-v1");
    h.update(&key);
    Ok(B64.encode(h.finalize()))
}

fn key_from_b64(key_b64: &str) -> Result<Key<Aes256Gcm>, String> {
    let raw = B64.decode(key_b64.trim()).map_err(|e| e.to_string())?;
    if raw.len() != KEY_LEN {
        return Err("Clave inválida: se esperaban 32 bytes".into());
    }
    Ok(*Key::<Aes256Gcm>::from_slice(&raw))
}

/// Cifra texto plano. Salida: `wf1.<nonce_b64>.<ciphertext_b64>`
#[tauri::command]
pub fn crypto_encrypt(key_b64: String, plaintext: String) -> Result<String, String> {
    let cipher = Aes256Gcm::new(&key_from_b64(&key_b64)?);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| "No se pudo cifrar el contenido".to_string())?;
    Ok(format!(
        "{}.{}.{}",
        FORMAT,
        B64.encode(nonce_bytes),
        B64.encode(ct)
    ))
}

/// Descifra un payload producido por `crypto_encrypt`.
#[tauri::command]
pub fn crypto_decrypt(key_b64: String, payload: String) -> Result<String, String> {
    let parts: Vec<&str> = payload.trim().split('.').collect();
    if parts.len() != 3 || parts[0] != FORMAT {
        return Err("Formato de payload cifrado no reconocido".into());
    }
    let nonce_bytes = B64.decode(parts[1]).map_err(|e| e.to_string())?;
    if nonce_bytes.len() != NONCE_LEN {
        return Err("Nonce inválido".into());
    }
    let ct = B64.decode(parts[2]).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(&key_from_b64(&key_b64)?);
    let pt = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_ref())
        .map_err(|_| "No se pudo descifrar: frase de paso incorrecta o dato alterado".to_string())?;
    String::from_utf8(pt).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ida_y_vuelta() {
        let salt = crypto_new_salt();
        let key = crypto_derive_key("una frase larga y difícil".into(), salt.clone()).unwrap();
        let payload = crypto_encrypt(key.clone(), "Hoy llovió sobre Madrid.".into()).unwrap();
        assert!(payload.starts_with("wf1."));
        let back = crypto_decrypt(key.clone(), payload.clone()).unwrap();
        assert_eq!(back, "Hoy llovió sobre Madrid.");

        // Otra frase de paso no debe poder descifrar
        let other = crypto_derive_key("otra frase".into(), salt).unwrap();
        assert!(crypto_decrypt(other, payload).is_err());
    }

    #[test]
    fn misma_frase_misma_sal_misma_clave() {
        let salt = crypto_new_salt();
        let a = crypto_derive_key("repetible".into(), salt.clone()).unwrap();
        let b = crypto_derive_key("repetible".into(), salt).unwrap();
        assert_eq!(a, b);
        assert_eq!(
            crypto_key_fingerprint(a.clone()).unwrap(),
            crypto_key_fingerprint(b).unwrap()
        );
    }
}
