import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {ToolBar} from './tool-bar/tool-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToolBar],
  templateUrl: './app.html',
  standalone: true,
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('btctutoring-app');
}
