package pm.nemu.mobile.windowlayout

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.util.Log
import android.view.ViewTreeObserver
import android.view.WindowInsets
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

private const val TAG = "NemuWindowLayout"

class NemuWindowLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NemuWindowLayout")
    View(NemuWindowLayoutView::class) {
      Events("onRegionsChange")
      Prop("enabled") { view: NemuWindowLayoutView, enabled: Boolean ->
        view.observationEnabled = enabled
      }
    }
  }
}

/**
 * Noninteractive observer matching the iOS view: reports its own bounds (dp),
 * safe-area insets, and foldable hinges from Jetpack WindowManager as
 * view-local divisions. Event-driven: `WindowInfoTracker.windowLayoutInfo`
 * emits on every posture/feature change, and a global-layout listener catches
 * this view moving within the window. Nothing polls.
 *
 * Diagnostics are off by default: `adb shell setprop log.tag.NemuWindowLayout DEBUG`.
 */
@SuppressLint("ViewConstructor")
class NemuWindowLayoutView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onRegionsChange by EventDispatcher()

  var observationEnabled = true
    set(value) {
      if (field == value) return
      field = value
      lastSnapshot = null
      updateObservation()
    }

  private var scope: CoroutineScope? = null
  private var trackerAvailable = false
  private var features: List<NemuFoldGeometry.Feature> = emptyList()
  private var lastSnapshot: Map<String, Any>? = null
  private var observedTree: ViewTreeObserver? = null
  private val location = IntArray(2)
  private var publishPosted = false
  private val globalLayoutListener = ViewTreeObserver.OnGlobalLayoutListener { schedulePublish() }

  init {
    isClickable = false
    isFocusable = false
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    lastSnapshot = null
    updateObservation()
  }

  override fun onDetachedFromWindow() {
    stopObservation()
    super.onDetachedFromWindow()
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    schedulePublish()
  }

  /** Coalesces a layout burst (e.g. a display switch) into one read after it settles. */
  private fun schedulePublish() {
    if (publishPosted) return
    publishPosted = true
    post {
      publishPosted = false
      publish()
    }
  }

  private fun updateObservation() {
    stopObservation()
    if (!observationEnabled || !isAttachedToWindow) return
    observedTree = viewTreeObserver.also { it.addOnGlobalLayoutListener(globalLayoutListener) }
    val activity = appContext.currentActivity
    trackerAvailable = activity != null
    if (activity != null) {
      val observerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
      scope = observerScope
      observerScope.launch {
        WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
          val folds = info.displayFeatures.filterIsInstance<FoldingFeature>()
          if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.d(TAG, "windowLayoutInfo " + folds.joinToString { f ->
              "state=${f.state} orientation=${f.orientation} separating=${f.isSeparating} " +
                "occlusion=${f.occlusionType} bounds=${f.bounds}"
            })
          }
          features = folds.map { f ->
            NemuFoldGeometry.Feature(
              left = f.bounds.left,
              top = f.bounds.top,
              right = f.bounds.right,
              bottom = f.bounds.bottom,
              halfOpened = f.state == FoldingFeature.State.HALF_OPENED,
              separating = f.isSeparating,
            )
          }
          publish()
        }
      }
    }
    publish()
  }

  private fun stopObservation() {
    scope?.cancel()
    scope = null
    observedTree?.let { if (it.isAlive) it.removeOnGlobalLayoutListener(globalLayoutListener) }
    observedTree = null
  }

  private fun publish() {
    if (!observationEnabled || !isAttachedToWindow || width <= 0 || height <= 0) return
    val density = resources.displayMetrics.density
    getLocationInWindow(location)
    val frame = NemuFoldGeometry.ViewFrame(location[0], location[1], width, height)
    val divisions = NemuFoldGeometry.divisions(features, frame, density)
    val payload = mutableMapOf<String, Any>(
      "width" to width / density.toDouble(),
      "height" to height / density.toDouble(),
      "supported" to trackerAvailable,
      "divisions" to divisions.map { it.toMap() },
      "occlusions" to emptyList<Map<String, Any>>(),
      "safeAreaInsets" to safeAreaInsets(frame, density).toMap(),
      "layoutDirection" to if (layoutDirection == LAYOUT_DIRECTION_RTL) "rtl" else "ltr",
    )
    NemuFoldGeometry.hingeStatus(features)?.let { payload["hinge"] = it }
    if (payload == lastSnapshot) return
    lastSnapshot = payload
    if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, "publish $payload")
    onRegionsChange(payload)
  }

  private fun safeAreaInsets(frame: NemuFoldGeometry.ViewFrame, density: Float): NemuFoldGeometry.Insets {
    val insets = rootWindowInsets ?: return NemuFoldGeometry.Insets(0.0, 0.0, 0.0, 0.0)
    val root = rootView
    val (left, top, right, bottom) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
      listOf(i.left, i.top, i.right, i.bottom)
    } else {
      @Suppress("DEPRECATION")
      listOf(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
    }
    return NemuFoldGeometry.viewInsets(left, top, right, bottom, root.width, root.height, frame, density)
  }
}
