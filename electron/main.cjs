const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;

function showLoadFailure(error) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL("https://aleppo-center-cash.vercel.app/");
