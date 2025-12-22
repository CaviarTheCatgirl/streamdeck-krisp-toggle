import streamDeck from "@elgato/streamdeck";

import { KrispToggleAction } from "./actions/krisp-toggle-action";

// Register the Krisp Toggle action
streamDeck.actions.registerAction(new KrispToggleAction());

// Connect to Stream Deck
streamDeck.connect();