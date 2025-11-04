import { qs, getParam, copyText } from '../utils.js';

const quizId = getParam('quizId');
const last = JSON.parse(sessionStorage.getItem('lastCreated') || 'null');
const title = last && last.quizId === quizId ? last.title : '';

qs('#done-title').textContent = title ? `タイトル：${title}` : '';
const url = `${location.origin}/play/${quizId}`;
qs('#play-url').value = url;
qs('#btn-start').setAttribute('href', `/play/${quizId}`);

qs('#copy').addEventListener('click', () => copyText(url));
