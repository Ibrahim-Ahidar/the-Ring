package expo.modules.vodozemac

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import uniffi.pulse_vodozemac.*

/**
 * Handle based bridge: JS holds string handles, native keeps the uniffi objects.
 * Binary values (plaintext, pickle keys) cross the bridge as base64 strings.
 */
class VodozemacModule : Module() {
  private val objects = ConcurrentHashMap<String, Any>()

  private fun put(o: Any): String = UUID.randomUUID().toString().also { objects[it] = o }

  @Suppress("UNCHECKED_CAST")
  private fun <T> get(h: String): T =
    (objects[h] ?: throw CodedException("ERR_HANDLE", "unknown handle $h", null)) as T

  private fun b(s: String): ByteArray = Base64.decode(s, Base64.NO_WRAP)
  private fun s(x: ByteArray): String = Base64.encodeToString(x, Base64.NO_WRAP)

  override fun definition() = ModuleDefinition {
    Name("Vodozemac")

    Function("release") { h: String -> objects.remove(h); null }

    // Account
    AsyncFunction("accountNew") { -> put(OlmAccount()) }
    AsyncFunction("accountFromPickle") { p: String, k: String -> put(OlmAccount.fromPickle(p, b(k))) }
    AsyncFunction("accountPickle") { h: String, k: String -> get<OlmAccount>(h).pickle(b(k)) }
    AsyncFunction("accountIdentityKeys") { h: String ->
      val i = get<OlmAccount>(h).identityKeys()
      mapOf("ed25519" to i.ed25519, "curve25519" to i.curve25519)
    }
    AsyncFunction("accountSign") { h: String, m: String -> get<OlmAccount>(h).sign(b(m)) }
    AsyncFunction("accountGenerateOneTimeKeys") { h: String, n: Int ->
      get<OlmAccount>(h).generateOneTimeKeys(n.toUInt())
    }
    AsyncFunction("accountOneTimeKeys") { h: String -> get<OlmAccount>(h).oneTimeKeys() }
    AsyncFunction("accountMarkKeysAsPublished") { h: String -> get<OlmAccount>(h).markKeysAsPublished() }
    AsyncFunction("accountCreateOutboundSession") { h: String, idKey: String, otk: String ->
      put(get<OlmAccount>(h).createOutboundSession(idKey, otk))
    }
    AsyncFunction("accountCreateInboundSession") { h: String, idKey: String, type: Int, body: String ->
      val r = get<OlmAccount>(h).createInboundSession(idKey, type.toUInt(), body)
      mapOf("session" to put(r.session), "plaintext" to s(r.plaintext))
    }

    // Olm session
    AsyncFunction("sessionFromPickle") { p: String, k: String -> put(OlmSession.fromPickle(p, b(k))) }
    AsyncFunction("sessionPickle") { h: String, k: String -> get<OlmSession>(h).pickle(b(k)) }
    AsyncFunction("sessionId") { h: String -> get<OlmSession>(h).sessionId() }
    AsyncFunction("sessionEncrypt") { h: String, pt: String ->
      val m = get<OlmSession>(h).encrypt(b(pt))
      mapOf("type" to m.messageType.toInt(), "body" to m.body)
    }
    AsyncFunction("sessionDecrypt") { h: String, type: Int, body: String ->
      s(get<OlmSession>(h).decrypt(type.toUInt(), body))
    }

    // Megolm outbound
    AsyncFunction("groupNew") { -> put(MegolmOutbound()) }
    AsyncFunction("groupFromPickle") { p: String, k: String -> put(MegolmOutbound.fromPickle(p, b(k))) }
    AsyncFunction("groupPickle") { h: String, k: String -> get<MegolmOutbound>(h).pickle(b(k)) }
    AsyncFunction("groupSessionId") { h: String -> get<MegolmOutbound>(h).sessionId() }
    AsyncFunction("groupSessionKey") { h: String -> get<MegolmOutbound>(h).sessionKey() }
    AsyncFunction("groupEncrypt") { h: String, pt: String -> get<MegolmOutbound>(h).encrypt(b(pt)) }

    // Megolm inbound
    AsyncFunction("inboundNew") { key: String -> put(MegolmInbound(key)) }
    AsyncFunction("inboundFromPickle") { p: String, k: String -> put(MegolmInbound.fromPickle(p, b(k))) }
    AsyncFunction("inboundPickle") { h: String, k: String -> get<MegolmInbound>(h).pickle(b(k)) }
    AsyncFunction("inboundSessionId") { h: String -> get<MegolmInbound>(h).sessionId() }
    AsyncFunction("inboundDecrypt") { h: String, m: String ->
      val d = get<MegolmInbound>(h).decrypt(m)
      mapOf("plaintext" to s(d.plaintext), "messageIndex" to d.messageIndex.toInt())
    }
  }
}
