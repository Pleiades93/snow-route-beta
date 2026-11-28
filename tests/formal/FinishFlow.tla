---- MODULE FinishFlow ----
\* Finish/banner ordering model; assumptions and scope live in docs/STATE-MODELS.md.
EXTENDS Integers

CONSTANT MaxClean

VARIABLES
    phase,        \* "idle" | "cleaning" | "confirming" | "saving" | "returned"
    clean,        \* id of the live clean, 0 = none
    nextClean,    \* id allocator: ids are never reused
    gapPending,   \* the live clean's in-memory gap flag
    archiving,    \* the live attempt's archive eligibility (abstract input)
    stamped,      \* the live attempt's snapshot carries the gap stamp
    banner,       \* "hidden" | "showing"
    bannerKind,   \* "none" | "gap" | "stopped" | "other"
    advisedFor,   \* clean the gap advisory on the banner belongs to
    emitCommitted, \* emission basis: clean whose commit the advisory rested on
    emitStamped,   \* emission basis: clean whose stamp the advisory rested on
    committedClean, \* history: last clean whose finish committed
    failedClean,    \* history: last clean whose finish failed or degraded
    stampedClean,   \* history: last clean whose snapshot was stamped
    cancelledClean  \* history: last clean cancelled before finishing

vars == <<phase, clean, nextClean, gapPending, archiving, stamped, banner,
          bannerKind, advisedFor, emitCommitted, emitStamped,
          committedClean, failedClean, stampedClean, cancelledClean>>

GapBannerFor == IF bannerKind = "gap" THEN advisedFor ELSE 0

TypeOK ==
    /\ phase \in {"idle", "cleaning", "confirming", "saving", "returned"}
    /\ clean \in 0..MaxClean
    /\ nextClean \in 1..(MaxClean + 1)
    /\ gapPending \in BOOLEAN
    /\ archiving \in BOOLEAN
    /\ stamped \in BOOLEAN
    /\ banner \in {"hidden", "showing"}
    /\ bannerKind \in {"none", "gap", "stopped", "other"}
    /\ (banner = "hidden") <=> (bannerKind = "none")
    /\ advisedFor \in 0..MaxClean
    /\ emitCommitted \in 0..MaxClean
    /\ emitStamped \in 0..MaxClean
    /\ committedClean \in 0..MaxClean
    /\ failedClean \in 0..MaxClean
    /\ stampedClean \in 0..MaxClean
    /\ cancelledClean \in 0..MaxClean

Init ==
    /\ phase = "idle"
    /\ clean = 0
    /\ nextClean = 1
    /\ gapPending = FALSE
    /\ archiving = FALSE
    /\ stamped = FALSE
    /\ banner = "hidden"
    /\ bannerKind = "none"
    /\ advisedFor = 0
    /\ emitCommitted = 0
    /\ emitStamped = 0
    /\ committedClean = 0
    /\ failedClean = 0
    /\ stampedClean = 0
    /\ cancelledClean = 0

\* startClean / RUN.begin: a new clean takes the next id.
StartClean ==
    /\ phase = "idle"
    /\ nextClean <= MaxClean
    /\ clean' = nextClean
    /\ nextClean' = nextClean + 1
    /\ phase' = "cleaning"
    /\ gapPending' = FALSE
    /\ stamped' = FALSE
    /\ UNCHANGED <<emitCommitted, emitStamped, archiving, banner, bannerKind, advisedFor,
                   committedClean, failedClean, stampedClean, cancelledClean>>

\* The stale-watch watchdog stamps the live clean's flag (app3.js).
MarkGap ==
    /\ phase = "cleaning"
    /\ ~gapPending
    /\ gapPending' = TRUE
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, phase, clean, archiving, stamped, banner, bannerKind,
                   advisedFor, committedClean, failedClean, stampedClean,
                   cancelledClean>>

\* resetBtn: the confirmation opens; eligibility is an input here.
PressFinish ==
    /\ phase = "cleaning"
    /\ phase' = "confirming"
    /\ archiving' \in BOOLEAN
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, clean, gapPending, stamped, banner, bannerKind,
                   advisedFor, committedClean, failedClean, stampedClean,
                   cancelledClean>>

\* finNo: back to the clean; the clean and its flag continue.
CancelConfirm ==
    /\ phase = "confirming"
    /\ phase' = "cleaning"
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, clean, gapPending, archiving, stamped, banner,
                   bannerKind, advisedFor, committedClean, failedClean,
                   stampedClean, cancelledClean>>

\* askCancelStart confirmed / cancelStart: the clean is discarded
\* and its flag dies with it (RUN.end).
CancelClean ==
    /\ phase = "cleaning"
    /\ phase' = "idle"
    /\ cancelledClean' = clean
    /\ clean' = 0
    /\ gapPending' = FALSE
    /\ stamped' = FALSE
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, archiving, banner, bannerKind, advisedFor,
                   committedClean, failedClean, stampedClean>>

\* finYes: finishRun() runs; buildSnap stamps the snapshot iff the
\* flag is set for this clean and the finish archives.
ConfirmFinish ==
    /\ phase = "confirming"
    /\ phase' = "saving"
    /\ stamped' = gapPending /\ archiving
    /\ stampedClean' = IF gapPending /\ archiving THEN clean ELSE stampedClean
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, clean, gapPending, archiving, banner, bannerKind,
                   advisedFor, committedClean, failedClean, cancelledClean>>

\* The transaction commits; the commit itself raises no banner.
SaveCommit ==
    /\ phase = "saving"
    /\ phase' = "returned"
    /\ committedClean' = clean
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, clean, gapPending, archiving, stamped, banner,
                   bannerKind, advisedFor, failedClean, stampedClean,
                   cancelledClean>>

\* The transaction aborts (rolled back or degraded): the failure
\* banner is the transaction's own report, raised as it aborts.
SaveFail ==
    /\ phase = "saving"
    /\ phase' = "returned"
    /\ failedClean' = clean
    /\ banner' = "showing"
    /\ bannerKind' = "stopped"
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, clean, gapPending, archiving, stamped, advisedFor,
                   committedClean, stampedClean, cancelledClean>>

\* The finYes handler's post-return step: the ONLY action that
\* raises the gap advisory, and only for a committed, stamped finish.
Advise ==
    /\ phase = "returned"
    /\ committedClean = clean
    /\ stamped
    /\ banner' = "showing"
    /\ bannerKind' = "gap"
    /\ advisedFor' = clean
    /\ emitCommitted' = committedClean
    /\ emitStamped' = IF stamped THEN clean ELSE emitStamped
    /\ UNCHANGED <<nextClean, phase, clean, gapPending, archiving, stamped,
                   committedClean, failedClean, stampedClean, cancelledClean>>

\* finishRun's teardown consumed the clean (RUN.end).
EndClean ==
    /\ phase = "returned"
    /\ phase' = "idle"
    /\ clean' = 0
    /\ gapPending' = FALSE
    /\ stamped' = FALSE
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, archiving, banner, bannerKind, advisedFor,
                   committedClean, failedClean, stampedClean, cancelledClean>>

\* Any other notification: replaces whatever shows, in any phase.
\* Modelled as-is: no exclusion during the finish flow is claimed.
OtherNotify ==
    /\ banner' = "showing"
    /\ bannerKind' = "other"
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, phase, clean, gapPending, archiving, stamped,
                   advisedFor, committedClean, failedClean, stampedClean,
                   cancelledClean>>

\* The banner's own stay ends (exit animation or the reduced-motion
\* timer in showBanner).
BannerHide ==
    /\ banner = "showing"
    /\ banner' = "hidden"
    /\ bannerKind' = "none"
    /\ UNCHANGED <<nextClean, emitCommitted, emitStamped, phase, clean, gapPending, archiving, stamped,
                   advisedFor, committedClean, failedClean, stampedClean,
                   cancelledClean>>

Next ==
    \/ StartClean
    \/ MarkGap
    \/ PressFinish
    \/ CancelConfirm
    \/ CancelClean
    \/ ConfirmFinish
    \/ SaveCommit
    \/ SaveFail
    \/ Advise
    \/ EndClean
    \/ OtherNotify
    \/ BannerHide

Spec == Init /\ [][Next]_vars

\* F1 (restated, Andrew's ruling 2026-11-26): the gap advisory for
\* a clean never shows while that clean's finish is in flight.
F1_NoGapDuringOwnFinish ==
    GapBannerFor # 0 =>
        ~(clean = GapBannerFor /\ phase \in {"confirming", "saving"})

\* F2: the advisory follows a committed finish of that clean.
F2_AdvisoryFollowsCommit ==
    GapBannerFor # 0 => emitCommitted = GapBannerFor

\* F4: the advisory belongs to the completed attempt, never to a
\* cancelled one.
F4_AdvisoryNotForCancelled ==
    GapBannerFor # 0 => cancelledClean # GapBannerFor

\* F5: the advisory requires the stamp on that clean's archive.
F5_AdvisoryRequiresStamp ==
    GapBannerFor # 0 => emitStamped = GapBannerFor

\* F6: a failed or degraded finish releases no gap advisory.
F6_NoAdvisoryOnFailure ==
    GapBannerFor # 0 => failedClean # GapBannerFor

====
