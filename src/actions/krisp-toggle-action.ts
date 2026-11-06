import streamDeck, { action, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const DISCORD_API_URL = "http://localhost:37320";
const STATE_FILE_PATH = join(tmpdir(), "vencord-krisp-state.txt");
const DEBOUNCE_MS = 150; // Ignore presses within 150ms of each other
const TRANSITION_GRACE_PERIOD = 2500; // Ignore file reads for 2.5s after toggle to avoid reading mid-transition

type ActionInstance = {
    action: WillAppearEvent<KrispToggleSettings>['action'];
};

/**
 * Krisp Toggle action - toggles Discord Krisp noise suppression
 */
@action({ UUID: "com.caviarthecatgirl.krisp-toggle.toggle" })
export class KrispToggleAction extends SingletonAction<KrispToggleSettings> {
    private pollInterval: NodeJS.Timeout | null = null;
    private visibleActions = new Map<string, ActionInstance>();
    private lastKnownMode: "Krisp" | "None" = "None";
    private isToggling = false;
    private lastDiscordOnlineCheck: boolean = true;
    private lastOnlineCheckTime: number = 0;
    private lastToggleTime: number = 0;
    private lastToggleCompletionTime: number = 0;
    private pendingToggle: Promise<void> | null = null;
    private expectedState: "Krisp" | "None" | null = null;
    private toggleAbortController: AbortController | null = null;

    /**
     * Read Krisp state from file
     */
    private readKrispState(): "Krisp" | "None" | "Standard" | "Transitioning" | "Unknown" {
        try {
            if (existsSync(STATE_FILE_PATH)) {
                const state = readFileSync(STATE_FILE_PATH, "utf8").trim();
                return (state as "Krisp" | "None" | "Standard" | "Transitioning") || "Unknown";
            }
        } catch (error) {
            streamDeck.logger.debug("Could not read state file:", error);
        }
        return "Unknown";
    }

    /**
     * Test if Discord is actually responding (cached for 5 seconds to avoid spam)
     */
    private async isDiscordResponding(): Promise<boolean> {
        // Cache check for 5 seconds to avoid hammering Discord
        const now = Date.now();
        if (now - this.lastOnlineCheckTime < 5000) {
            return this.lastDiscordOnlineCheck;
        }
        
        try {
            const response = await fetch(`${DISCORD_API_URL}/health`, {
                signal: AbortSignal.timeout(1000) // 1 second timeout
            });
            this.lastDiscordOnlineCheck = response.ok;
            this.lastOnlineCheckTime = now;
            return response.ok;
        } catch (error) {
            this.lastDiscordOnlineCheck = false;
            this.lastOnlineCheckTime = now;
            return false;
        }
    }

    /**
     * Toggle Krisp via Discord API
     */
    private async toggleKrisp(): Promise<void> {
        try {
            const response = await fetch(`${DISCORD_API_URL}/toggle`, {
                method: "POST"
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            streamDeck.logger.error("Failed to toggle Krisp:", error);
            throw error;
        }
    }

    /**
     * Check if we're in grace period after a toggle
     */
    private isInGracePeriod(): boolean {
        const now = Date.now();
        return now - this.lastToggleCompletionTime < TRANSITION_GRACE_PERIOD;
    }

    /**
     * Update button state based on Krisp state
     */
    private async updateButtonState(actionInstance: ActionInstance, forceUpdate = false): Promise<void> {
        // Don't update during a toggle operation to avoid flicker
        if (this.isToggling && !forceUpdate) {
            return;
        }

        // If we're in grace period and have an expected state, trust our expected state
        if (this.isInGracePeriod() && this.expectedState !== null) {
            streamDeck.logger.debug(`In grace period, trusting expected state: ${this.expectedState}`);
            const expectedDisplayState = this.expectedState === "Krisp" ? 1 : 0;
            if ('setState' in actionInstance.action) {
                await actionInstance.action.setState(expectedDisplayState);
            }
            return;
        }

        const state = this.readKrispState();
        
        streamDeck.logger.info(`Krisp state: ${state}, Last known: ${this.lastKnownMode}`);

        // If state is Unknown, don't change anything - keep current display
        if (state === "Unknown") {
            streamDeck.logger.debug("Discord offline, keeping current button state");
            return;
        }

        // Determine the display state
        let displayState: "On" | "Off";
        let newMode: "Krisp" | "None";

        if (state === "Krisp") {
            // Krisp is ON
            displayState = "On";
            newMode = "Krisp";
        } else if (state === "None" || state === "Standard") {
            // Krisp is OFF (None or Standard mode)
            displayState = "Off";
            newMode = "None";
        } else if (state === "Transitioning") {
            // Transitioning state (NS: false, NC: true) means Discord is SWITCHING TO Krisp
            // This happens during the 10ms delay between setNoiseCancellation(true) and setNoiseSuppression(true)
            streamDeck.logger.info("Transitioning state detected - switching to Krisp");
            displayState = "On";
            newMode = "Krisp";
        } else {
            // Shouldn't reach here, but just in case
            return;
        }

        // Update our tracking
        this.lastKnownMode = newMode;

        // Update the button
        if ('setState' in actionInstance.action) {
            if (displayState === "On") {
                await actionInstance.action.setState(1);
            } else if (displayState === "Off") {
                await actionInstance.action.setState(0);
            }
        }
    }

    /**
     * Update all visible buttons
     */
    private async updateAllVisibleButtons(): Promise<void> {
        // Check if Discord is online before updating from file
        const discordOnline = await this.isDiscordResponding();
        if (!discordOnline) {
            streamDeck.logger.debug("Discord offline, skipping state update");
            return;
        }
        
        for (const actionInstance of this.visibleActions.values()) {
            await this.updateButtonState(actionInstance);
        }
    }

    /**
     * Start polling for state changes
     */
    private startPolling(): void {
        if (this.pollInterval) return;

        // Poll every 2 seconds (reading a file is super cheap, but no need to spam)
        this.pollInterval = setInterval(async () => {
            if (this.visibleActions.size > 0) {
                await this.updateAllVisibleButtons();
            }
        }, 2000);

        streamDeck.logger.info("Started polling Krisp state file (every 2s)");
    }

    /**
     * Stop polling when no buttons are visible
     */
    private stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            streamDeck.logger.info("Stopped polling Krisp state");
        }
    }

    /**
     * Called when button appears (page loaded, profile switched, etc.)
     */
    override async onWillAppear(ev: WillAppearEvent<KrispToggleSettings>): Promise<void> {
        const contextId = JSON.stringify(ev.payload);
        streamDeck.logger.info(`Button appeared: ${contextId}`);
        
        // Store the action instance so we can update it during polling
        this.visibleActions.set(contextId, { action: ev.action });

        // Fetch initial state immediately
        await this.updateButtonState({ action: ev.action });

        // Start polling if not already running
        this.startPolling();
    }

    /**
     * Called when button disappears (page change, profile switch, etc.)
     */
    override async onWillDisappear(ev: WillDisappearEvent<KrispToggleSettings>): Promise<void> {
        const contextId = JSON.stringify(ev.payload);
        streamDeck.logger.info(`Button disappeared: ${contextId}`);
        
        // Remove from visible actions
        this.visibleActions.delete(contextId);

        // Stop polling if no buttons are visible
        if (this.visibleActions.size === 0) {
            this.stopPolling();
        }
    }

    /**
     * Update all button states to a specific value
     */
    private async setAllButtonStates(state: number): Promise<void> {
        for (const actionInstance of this.visibleActions.values()) {
            if ('setState' in actionInstance.action) {
                await actionInstance.action.setState(state);
            }
        }
    }

    /**
     * Called when button is released (not pressed down)
     */
    override async onKeyUp(ev: KeyUpEvent<KrispToggleSettings>): Promise<void> {
        const now = Date.now();
        
        // Debounce: Ignore presses that are too close together
        if (now - this.lastToggleTime < DEBOUNCE_MS) {
            streamDeck.logger.info(`Ignoring press (debounced, ${now - this.lastToggleTime}ms since last press)`);
            return;
        }

        // If a toggle is already in progress, abort it and start a new one
        if (this.pendingToggle) {
            streamDeck.logger.info("Toggle already in progress, cancelling it and starting fresh");
            
            // Signal the old toggle to abort
            if (this.toggleAbortController) {
                this.toggleAbortController.abort();
            }
            
            // Wait a tiny bit for the abort to take effect
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        this.lastToggleTime = now;
        streamDeck.logger.info("Button released, toggling Krisp");

        // Create new abort controller for this toggle
        this.toggleAbortController = new AbortController();
        
        // Create a promise for this toggle operation
        this.pendingToggle = this.performToggle(ev, this.toggleAbortController);
        
        try {
            await this.pendingToggle;
        } finally {
            this.pendingToggle = null;
            this.toggleAbortController = null;
        }
    }

    /**
     * Perform the actual toggle operation
     */
    private async performToggle(ev: KeyUpEvent<KrispToggleSettings>, abortController: AbortController): Promise<void> {
        // Immediately save current state before anything happens
        const savedState = this.lastKnownMode === "Krisp" ? 1 : 0;

        try {
            // Check if we've been aborted before starting
            if (abortController.signal.aborted) {
                streamDeck.logger.info("Toggle aborted before starting");
                return;
            }

            // Check if Discord is actually responding (not just file data)
            const discordOnline = await this.isDiscordResponding();
            if (!discordOnline) {
                streamDeck.logger.warn("Discord not responding, cannot toggle");
                // Immediately restore state BEFORE showing alert to prevent flicker
                await this.setAllButtonStates(savedState);
                await ev.action.showAlert();
                return;
            }

            // Check abort again
            if (abortController.signal.aborted) {
                streamDeck.logger.info("Toggle aborted after Discord check");
                return;
            }

            // Set toggling flag to prevent polling from overwriting our optimistic update
            this.isToggling = true;

            // Optimistically update the button immediately (predict the new state)
            const newState = this.lastKnownMode === "Krisp" ? 0 : 1;
            const newMode = this.lastKnownMode === "Krisp" ? "None" : "Krisp";
            
            // Set our expected state for the grace period
            this.expectedState = newMode;
            
            // Update all buttons immediately
            await this.setAllButtonStates(newState);
            this.lastKnownMode = newMode;

            // Check abort before making the API call
            if (abortController.signal.aborted) {
                streamDeck.logger.info("Toggle aborted before API call, reverting state");
                // Revert state
                await this.setAllButtonStates(savedState);
                this.lastKnownMode = savedState === 1 ? "Krisp" : "None";
                this.expectedState = null;
                this.isToggling = false;
                return;
            }

            // Toggle Krisp in the background
            await this.toggleKrisp();

            // Check abort after API call
            if (abortController.signal.aborted) {
                streamDeck.logger.warn("Toggle aborted after API call - Discord state may be inconsistent!");
                this.isToggling = false;
                this.expectedState = null;
                return;
            }

            // Wait for Discord to complete the transition
            // The Vencord plugin does: setNoiseCancellation, then 10ms delay, then setNoiseSuppression
            // We need to wait for both calls AND for the file to be written
            await new Promise(resolve => setTimeout(resolve, 300));

            // Clear toggling flag and mark completion time for grace period
            this.isToggling = false;
            this.lastToggleCompletionTime = Date.now();

            // Verify Discord is still responding
            const stillOnline = await this.isDiscordResponding();
            if (!stillOnline) {
                streamDeck.logger.error("Discord stopped responding during toggle");
                // Revert to saved state on all buttons
                await this.setAllButtonStates(savedState);
                this.lastKnownMode = savedState === 1 ? "Krisp" : "None";
                this.expectedState = null;
                await ev.action.showAlert();
                return;
            }

            // Wait for the full grace period, then verify and clear expected state
            // Don't force an update during the grace period - let polling handle it naturally
            setTimeout(() => {
                const currentState = this.readKrispState();
                streamDeck.logger.info(`Post-toggle verification: expected ${this.expectedState}, got ${currentState}`);
                
                // Only clear expected state if the file state matches what we expect
                // If it doesn't match, extend the grace period
                if (currentState === this.expectedState || currentState === "Unknown") {
                    streamDeck.logger.info("State verified, clearing expected state");
                    this.expectedState = null;
                } else {
                    streamDeck.logger.warn(`State mismatch! Expected ${this.expectedState}, got ${currentState}. Extending grace period.`);
                    // Extend grace period by another second
                    this.lastToggleCompletionTime = Date.now();
                }
            }, TRANSITION_GRACE_PERIOD);

        } catch (error) {
            // Make sure toggling flag is cleared
            this.isToggling = false;
            this.expectedState = null;
            streamDeck.logger.error("Failed to toggle Krisp:", error);
            // Restore the state to what it was before on all buttons
            await this.setAllButtonStates(savedState);
            this.lastKnownMode = savedState === 1 ? "Krisp" : "None";
            await ev.action.showAlert();
        }
    }
}

/**
 * Settings for the Krisp Toggle action (currently none needed)
 */
type KrispToggleSettings = Record<string, never>;