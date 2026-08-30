package pm.nemu.mobile.aidoku

import android.os.RemoteException
import androidx.javascriptengine.MemoryLimitExceededException
import androidx.javascriptengine.SandboxDeadException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class AidokuSandboxLifecycleTest {
  @Test
  fun recyclePolicyTripsOnlyAtAnOperationBoundaryAndResetsItsCount() {
    val policy = AidokuSandboxRecyclePolicy(maxEvaluations = 3)

    policy.recordEvaluation()
    policy.recordEvaluation()
    assertEquals(2, policy.evaluationCountForTesting())
    assertFalse(policy.takeRecycleAtBoundary())

    policy.recordEvaluation()
    // Reaching the ceiling requests a recycle; it does not close a runtime in
    // the middle of the active replay or image-message operation.
    assertEquals(3, policy.evaluationCountForTesting())
    assertTrue(policy.takeRecycleAtBoundary())
    assertEquals(0, policy.evaluationCountForTesting())
    assertFalse(policy.takeRecycleAtBoundary())
  }

  @Test
  fun memoryPressureRequestsRecycleAndNewGenerationRequiresRegistration() {
    val policy = AidokuSandboxRecyclePolicy(maxEvaluations = 100)
    policy.recordEvaluation()
    policy.requestRecycle()

    assertTrue(policy.takeRecycleAtBoundary())
    assertFalse(aidokuSandboxSessionNeedsRegistration(7, 7))
    assertTrue(aidokuSandboxSessionNeedsRegistration(7, 8))

    policy.recordEvaluation()
    policy.markIsolateReset()
    assertEquals(0, policy.evaluationCountForTesting())
    assertFalse(policy.takeRecycleAtBoundary())
  }

  @Test
  fun pendingSandboxConnectionIsRetainedAcrossAnAbandonedWaitAndReused() {
    val tracker = AidokuPendingSandboxConnection<CompletableFuture<String>>()
    val first = CompletableFuture<String>()
    val factoryCalls = AtomicInteger(0)

    val initial = tracker.getOrCreate {
      factoryCalls.incrementAndGet()
      first
    }
    // A timeout/interruption deliberately does not clear the tracked bind.
    val retry = tracker.getOrCreate {
      factoryCalls.incrementAndGet()
      CompletableFuture.completedFuture("unexpected")
    }

    assertSame(initial, retry)
    assertSame(first, tracker.currentForTesting())
    assertEquals(1, factoryCalls.get())

    first.complete("connected")
    assertTrue(tracker.clearIfSame(first))
    assertNull(tracker.currentForTesting())
  }

  @Test
  fun pendingSandboxConnectionCanBeDetachedForLateShutdownCleanup() {
    val tracker = AidokuPendingSandboxConnection<CompletableFuture<String>>()
    val pending = CompletableFuture<String>()
    tracker.getOrCreate { pending }

    assertSame(pending, tracker.detach())
    assertNull(tracker.currentForTesting())
    assertNull(tracker.detach())
  }

  @Test
  fun onlyConfirmedSandboxDeathRequiresClosingTheConnection() {
    assertEquals(
      AidokuSandboxResetScope.ISOLATE,
      aidokuSandboxResetScope(MemoryLimitExceededException("bounded isolate OOM"))
    )
    assertEquals(
      AidokuSandboxResetScope.SANDBOX_CONNECTION,
      aidokuSandboxResetScope(SandboxDeadException("service died"))
    )
    assertEquals(
      AidokuSandboxResetScope.SANDBOX_CONNECTION,
      aidokuSandboxResetScope(
        ExecutionException("wrapped", SandboxDeadException("service died"))
      )
    )
    assertEquals(
      AidokuSandboxResetScope.SANDBOX_CONNECTION,
      aidokuSandboxResetScope(
        ExecutionException("wrapped", RemoteException("Binder transaction failed"))
      )
    )
  }

  @Test
  fun cancellingThirtyTwoQueuedCompletionFuturesCannotCancelNativeCleanup() {
    val executor = Executors.newSingleThreadExecutor()
    val queueBlocked = CountDownLatch(1)
    val releaseQueue = CountDownLatch(1)
    val cleanupFinished = CountDownLatch(32)
    val cleanupCount = AtomicInteger(0)
    try {
      executor.execute {
        queueBlocked.countDown()
        releaseQueue.await(5, TimeUnit.SECONDS)
      }
      assertTrue(queueBlocked.await(2, TimeUnit.SECONDS))

      val completions = List(32) {
        enqueueNonCancellableAidokuCleanup(executor) {
          cleanupCount.incrementAndGet()
          cleanupFinished.countDown()
          "disposed"
        }
      }
      completions.forEach { it.cancel(true) }
      releaseQueue.countDown()

      assertTrue(cleanupFinished.await(5, TimeUnit.SECONDS))
      assertEquals(32, cleanupCount.get())
      assertTrue(completions.all { it.isCancelled })
    } finally {
      releaseQueue.countDown()
      executor.shutdownNow()
    }
  }

  @Test
  fun destroyAndCreateShareOneAtomicOwnerLock() {
    val owner = AidokuSandboxManagerOwner<String>()
    val executor = Executors.newFixedThreadPool(2)
    val factoryStarted = CountDownLatch(1)
    val releaseFactory = CountDownLatch(1)
    val closed = CountDownLatch(1)
    val closeCount = AtomicInteger(0)
    try {
      val creation = executor.submit<String> {
        owner.getOrCreate {
          factoryStarted.countDown()
          releaseFactory.await(5, TimeUnit.SECONDS)
          "manager"
        }
      }
      assertTrue(factoryStarted.await(2, TimeUnit.SECONDS))
      val destruction = executor.submit {
        owner.destroy {
          closeCount.incrementAndGet()
          closed.countDown()
        }
      }

      releaseFactory.countDown()
      assertEquals("manager", creation.get(2, TimeUnit.SECONDS))
      destruction.get(2, TimeUnit.SECONDS)
      assertTrue(closed.await(2, TimeUnit.SECONDS))
      assertEquals(1, closeCount.get())
      assertTrue(owner.isDestroyedForTesting())
      assertNull(owner.current())

      try {
        owner.getOrCreate { "late-manager" }
        fail("OnDestroy must permanently reject a late manager creation.")
      } catch (_: IllegalStateException) {
        // Expected.
      }
    } finally {
      releaseFactory.countDown()
      executor.shutdownNow()
    }
  }
}
