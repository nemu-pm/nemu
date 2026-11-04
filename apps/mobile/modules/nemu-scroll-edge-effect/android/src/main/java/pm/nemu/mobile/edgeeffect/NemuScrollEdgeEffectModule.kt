package pm.nemu.mobile.edgeeffect

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.os.PowerManager
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

/** AGSL runtime shaders (and so the progressive blur) need API 33. */
private val SUPPORTS_PROGRESSIVE_BLUR = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

class NemuScrollEdgeEffectModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NemuScrollEdgeEffect")
    Constants("supportsProgressiveBlur" to SUPPORTS_PROGRESSIVE_BLUR)
    View(NemuScrollEdgeEffectView::class) {
      Prop("enabled") { view: NemuScrollEdgeEffectView, enabled: Boolean ->
        view.effectEnabled = enabled
      }
      Prop("bottomEdgeHeight") { view: NemuScrollEdgeEffectView, height: Float ->
        view.bottomEdgeHeightDp = height
      }
      Prop("maxBlurRadius") { view: NemuScrollEdgeEffectView, radius: Float ->
        view.maxBlurRadiusDp = radius
      }
      Prop("blurExponent") { view: NemuScrollEdgeEffectView, exponent: Float ->
        view.blurExponent = exponent
      }
      OnViewDidUpdateProps { view: NemuScrollEdgeEffectView -> view.updateEffect() }
    }
  }
}

/**
 * Replica of the iOS 26 soft scroll edge effect for Android: a plain container
 * around the app's navigation stack that, while enabled, renders its own
 * content through a progressive blur whose radius ramps from 0 at the top of a
 * bottom band to `maxBlurRadius` at the bottom edge.
 *
 * Android has no backdrop-filter, so the blur is applied to the content itself
 * with `View.setRenderEffect` (two chained, separable AGSL passes). It runs
 * entirely in the RenderThread on the GPU: scrolling never calls back into
 * JS, and pixels above the band take a single texture sample. The colour fade
 * that goes with it is a separate JS gradient scrim, so API < 33 and battery
 * saver keep the fade and just skip the blur.
 */
@SuppressLint("ViewConstructor")
class NemuScrollEdgeEffectView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var effectEnabled = false
  var bottomEdgeHeightDp = 0f
  var maxBlurRadiusDp = 0f
  var blurExponent = 1.5f

  private var applied = false
  private var appliedSignature: String? = null
  private var powerSaveReceiverRegistered = false
  private val powerSaveReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) = updateEffect()
  }

  private fun isPowerSaveMode(): Boolean =
    (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !powerSaveReceiverRegistered) {
      // A protected system broadcast; NOT_EXPORTED still receives it.
      context.registerReceiver(
        powerSaveReceiver,
        IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
        Context.RECEIVER_NOT_EXPORTED,
      )
      powerSaveReceiverRegistered = true
    }
    updateEffect()
  }

  override fun onDetachedFromWindow() {
    if (powerSaveReceiverRegistered) {
      runCatching { context.unregisterReceiver(powerSaveReceiver) }
      powerSaveReceiverRegistered = false
    }
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateEffect()
  }

  fun updateEffect() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val density = resources.displayMetrics.density
    val bandPx = bottomEdgeHeightDp * density
    val radiusPx = maxBlurRadiusDp * density
    val active = effectEnabled && width > 0 && height > 0 && bandPx >= 1f &&
      radiusPx >= 1f && !isPowerSaveMode()
    if (!active) {
      if (applied) {
        setRenderEffect(null)
        applied = false
        appliedSignature = null
      }
      return
    }
    val signature = "$width:$height:$bandPx:$radiusPx:$blurExponent"
    if (applied && signature == appliedSignature) return
    ProgressiveBlurApi33.apply(
      view = this,
      width = width.toFloat(),
      height = height.toFloat(),
      bandTop = (height - bandPx).coerceAtLeast(0f),
      maxRadius = radiusPx,
      exponent = blurExponent.coerceIn(0.2f, 4f),
    )
    applied = true
    appliedSignature = signature
  }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private object ProgressiveBlurApi33 {
  // One separable Gaussian pass (sigma = radius / 3, 25 taps across ±radius)
  // whose radius depends only on the output row. Rows above the band return
  // the untouched sample.
  private const val SHADER = """
    uniform shader content;
    uniform float2 viewSize;
    uniform float bandTop;
    uniform float maxRadius;
    uniform float exponent;
    uniform float2 direction;

    half4 main(float2 p) {
      float band = max(viewSize.y - bandTop, 1.0);
      float t = clamp((p.y - bandTop) / band, 0.0, 1.0);
      float radius = maxRadius * pow(t, exponent);
      if (radius < 0.5) {
        return content.eval(p);
      }
      half4 sum = half4(0.0);
      float weightSum = 0.0;
      for (int i = -12; i <= 12; i++) {
        float k = float(i) / 12.0;
        float w = exp(-4.5 * k * k);
        float2 q = clamp(p + direction * (k * radius), float2(0.5), viewSize - float2(0.5));
        sum += content.eval(q) * half(w);
        weightSum += w;
      }
      return sum / half(weightSum);
    }
  """

  fun apply(
    view: android.view.View,
    width: Float,
    height: Float,
    bandTop: Float,
    maxRadius: Float,
    exponent: Float,
  ) {
    fun pass(dx: Float, dy: Float): RenderEffect {
      val shader = RuntimeShader(SHADER)
      shader.setFloatUniform("viewSize", width, height)
      shader.setFloatUniform("bandTop", bandTop)
      shader.setFloatUniform("maxRadius", maxRadius)
      shader.setFloatUniform("exponent", exponent)
      shader.setFloatUniform("direction", dx, dy)
      return RenderEffect.createRuntimeShaderEffect(shader, "content")
    }
    // Horizontal first (inner), then vertical (outer).
    view.setRenderEffect(RenderEffect.createChainEffect(pass(0f, 1f), pass(1f, 0f)))
  }
}
