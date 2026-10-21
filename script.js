//
// State
//

let STATE;

const
    _ANI_DURATION = parseInt(
        window
            .getComputedStyle(document.body)
            .getPropertyValue('--a-bar')
    ),
    _DEFAULT_NAMES = [
        'Junhui',
        'Williams'
    ],
    _BALL_TYPES = {
        red: 1,
        yellow: 2,
        green: 3,
        brown: 4,
        blue: 5,
        pink: 6,
        black: 7
    },
    _BALL_RED_COUNT = 15,
    _BALL_TYPE_MISSED = 0,
    _BALL_STATE_REMAIN = -1,
    _MIN_PENALTY = 4,
    _STATE_INIT = {
        activePlayer: 0,
        balls:
            [
                ...new Array(_BALL_RED_COUNT)
                    .fill([_BALL_TYPES.red, _BALL_TYPES.black])
                    .flat(),
                ...Object
                    .values(_BALL_TYPES)
                    .filter(type => type !== _BALL_TYPES.red)
            ]
            .map(b => _newBall(b)),
        lastAddedIndex: -1,
        allowFreeBall: true,
        isFreeBall: false,
        afterRed: false,
        showSnookers: false,
        breaks: [[], []],
        undos: []
    };

//
// Public functions
//

async function switchTurn() {
    if (STATE.afterRed || STATE.isFreeBall) {
        if (STATE.afterRed) {
            STATE.afterRed = false;
        } else {
            _removeBall();
        }
        _removeBall();
        STATE.isFreeBall = false;
        _updateRender();
        await _afterAnimation(() => switchTurn());
        return;
    }

    STATE.activePlayer = STATE.activePlayer === 0 ? 1 : 0;
    STATE.allowFreeBall = true;

    const
        SCORE_DIFF = _getScoreDiff(),
        BALLS_0  = STATE.balls.filter(b => b.state === 0),
        BALLS_F0 = SCORE_DIFF < 0
            ? STATE.balls.filter(b => b.state === _BALL_STATE_REMAIN && b.type < 0)
            : [],
        BALLS_R  = STATE.balls.filter(b => b.state === _BALL_STATE_REMAIN && b.type > 0),
        BALLS_F1 = SCORE_DIFF > 0
            ? STATE.balls.filter(b => b.state === _BALL_STATE_REMAIN && b.type < 0)
            : [],
        BALLS_1  = STATE.balls.filter(b => b.state === 1);

    STATE.balls = [
        ...BALLS_0,
        ...BALLS_F0,
        ...BALLS_R.reverse(),
        ...BALLS_F1,
        ...BALLS_1
    ];
    _updateRender();
}

function potBall(type) {
    const MISSED_COLOR = STATE.afterRed && type === _BALL_TYPES.red;
    if (MISSED_COLOR) {
        _removeBall();
        _updateRender()
    }

    const BALL = _getNextBall();

    if (BALL.type < 0) {
        const LAST_SNOOKER_INDEX = STATE.balls[
            STATE.activePlayer
                ? 'findIndex'
                : 'findLastIndex'
        ](b => b.state === _BALL_STATE_REMAIN && b.type < 0);
        STATE.balls[LAST_SNOOKER_INDEX + (STATE.activePlayer ? -1 : 1)].type *= -1;
    }
    BALL.state = STATE.activePlayer;
    BALL.type = type;
    
    STATE.afterRed = type === _BALL_TYPES.red;
    STATE.isFreeBall = false;
    STATE.allowFreeBall = false;

    _updateRender();
}

function addFoulBall(type) {
    const
        OTHER_PLAYER = STATE.activePlayer === 0 ? 1 : 0,
        SNOOKER_BALL = STATE.balls[
            OTHER_PLAYER
                ? 'findLast'
                : 'find'
        ](b => b.state === _BALL_STATE_REMAIN && b.type < 0);
    
    if (SNOOKER_BALL) {
        SNOOKER_BALL.type = _getFoulPenalty(type) * -1;
        SNOOKER_BALL.state = OTHER_PLAYER
    } else {
        _addBall(
            _newBall(
                _getFoulPenalty(type) * -1,
                OTHER_PLAYER
            ),
            _getInsertIndex(OTHER_PLAYER)
        );
    }

    STATE.allowFreeBall = false;

    _updateRender();
}

function addFoulRedPot() {
    _removeBall();
    _removeBall();
    if (STATE.afterRed) {
        _removeBall();
        STATE.afterRed = false;
    }
    _updateRender();
    STATE.isFreeBall = false;
    
}

function addFreeBall() {
    const LOWEST_BALL = _getLowestBallType();

    if (LOWEST_BALL === _BALL_TYPES.red) {
        _addBall(
            _newBall(_BALL_TYPES.black),
            _getInsertIndex()
        );
    }
    _addBall(
        _newBall(LOWEST_BALL),
        _getInsertIndex()
    );

    STATE.allowFreeBall = false;
    STATE.isFreeBall = true;
    _updateRender();
}

function undo() {
    if (STATE.undos.length > 1) {
        STATE.undos.pop();
        const
            WAS_FREEBALL = STATE.isFreeBall,
            PREV = JSON.parse(STATE.undos.pop());

        if (STATE.balls.length > PREV.balls.length) {
            _removeBall(-1);
        }

        if (PREV) {
            STATE = {
                ...PREV,
                undos: STATE.undos
            };
            _updateRender();
        }

        if (WAS_FREEBALL) {
            undo();
        }
    }
}

function reset() {
    _getEl('bar__ball--foul bar__ball--free', -1)
        .forEach(el => el.parentElement.removeChild(el));
    _initState();
    _updateRender();
}


//
// Private render functions
//

function _initRender() {
    const APP = _getEl('app');

    // Score
    APP.innerHTML += `
        <div class="score">
            <div class="bar">
                ${
                    STATE.balls
                        .map(() => '<span class="bar__ball"></span>')
                        .join(' ')
                }
                <div class="bar__captions">
                    <span class="bar__captions-snookers"></span>
                    <span class="bar__captions-remain"></span>
                </div>
            </div>

            ${
                [0, 1]
                    .map((_, i) => `
                        <div class="score__player">
                            <span
                                class="score__name"
                                contenteditable
                            >
                                ${ _DEFAULT_NAMES[i] }
                            </span>
                            <span class="score__score"></span>
                        </div>
                    `)
                    .join('')
            }
        </div>
    `;

    // Controls
    APP.innerHTML += `
        <div class="controls">
            <button
                class="controls__large"
                onclick="switchTurn()"
            >
                End visit
            </button>
            <button
                class="controls__large controls__free"
                onclick="addFreeBall()"
            >
                Free ball
            </button>

            ${
                Object
                    .values(_BALL_TYPES)
                    .map(type => `
                        <button
                            class="controls__pot"
                            onclick="potBall(${ type })"
                        >
                            Pot
                        </button>
                        <span class="
                            controls__icon
                            controls__icon--${ type }
                        "></span>
                        <div class="controls__foul-contain">
                            <button
                                class="controls__foul secondary"
                                onclick="addFoulBall(${ type })"
                            >
                                Foul
                            </button>
                            ${
                                type === _BALL_TYPES.red
                                    ? `
                                        <button
                                            class="controls__extra controls__foul secondary"
                                            onclick="addFoulRedPot()"
                                        >
                                            Remove
                                        </button>
                                    `
                                    : ''
                            }
                        </div>
                    `)
                    .join('') 
            }

            <button
                class="controls__large"
                onclick="undo()"
            >
                Undo
            </button>
            <button
                class="controls__large"
                onclick="reset()"
            >
                Reset
            </button>
        </div>`;
}

async function _updateRender() {
    const
        EL_REMAIN = _getEl('bar__captions-remain'),
        EL_PLAYERS = _getEl('score__player', -1),
        EL_SCORES = _getEl('score__score', -1),
        EL_POTS = _getEl('controls__pot', -1),
        EL_FOULS = _getEl('controls__foul', -1);

    const
        REMAIN = _getScore(_BALL_STATE_REMAIN),
        DIFF = _getScoreDiff(),
        DIFF_ABS = Math.abs(DIFF),
        FOUL_PENALTY = _getFoulPenalty(),
        SNOOKERS = Math.ceil(Math.max(0, DIFF_ABS - REMAIN) / FOUL_PENALTY);

    // Score
    EL_PLAYERS.forEach((el, i) => {
        el.classList.toggle('score__player--active', i === STATE.activePlayer);
        EL_SCORES[i].innerHTML = _getScore(i);
    });

    // Captions
    if (SNOOKERS) {
        EL_REMAIN.innerHTML =
            SNOOKERS +
            ' Snooker' +
            (SNOOKERS > 1 ? 's' : '') +
            ' required';
    } else {
        EL_REMAIN.innerHTML =
            (
                DIFF === 0
                    ? ''
                    : DIFF > 0 && STATE.activePlayer
                    ? DIFF_ABS + ' Behind, '
                    : DIFF_ABS + ' Ahead,&nbsp; '
            ) + 
            REMAIN + ' Remaining';
    }

    // Snookers
    const
        SNOOKER_BALLS = STATE.balls.filter(b => b.type < 0 && b.state == _BALL_STATE_REMAIN),
        ADDED_SNOOKERS = SNOOKERS - SNOOKER_BALLS.length;
    SNOOKER_BALLS.forEach(b => b.type = FOUL_PENALTY * -1);

    if (SNOOKERS === 0) {
        STATE.showSnookers = false;
    } else if (DIFF > 0 != !STATE.activePlayer) {
        STATE.showSnookers = true;
    }
    if (STATE.showSnookers) {
        for (let i = 0; i < ADDED_SNOOKERS; i++) {
            _addBall(
                _newBall(FOUL_PENALTY * -1),
                _getInsertIndex()
            );
        }
    }
    for (let i = ADDED_SNOOKERS; i < 0; i++) {
        _removeBall(
            STATE.balls[
                STATE.activePlayer
                    ? 'findLastIndex'
                    : 'findIndex'
            ](b => b.state === _BALL_STATE_REMAIN && b.type < 0)
        );
    }
    if (
        ADDED_SNOOKERS < 0 ||
        (STATE.showSnookers && ADDED_SNOOKERS)
    ) {
        await _afterAnimation();
    }

    // Bar
    let
        currentX = 0,
        captionX = -1;
    const
        EL_BALLS = _getEl('bar__ball:not(.bar__ball--remove)', -1),
        W = 100 / (STATE.balls.reduce((sum, b) => sum + Math.abs(b.type), 0));
    STATE.balls.forEach((b, i) => {
        const EL_BALL = EL_BALLS[i];
        EL_BALL.setAttribute(
            'class',
            [
                '',
                '--type-' + Math.abs(b.type),
                b.state === _BALL_STATE_REMAIN
                    ? '--remain'
                    : '--player-' + b.state,
                b.type < 0 ? '--foul' : null
            ]
                .filter(c => c !== null)
                .map(c => 'bar__ball' + c)
                .join(' ')
        );

        const EL_BALL_W = Math.abs(b.type) * W;
        EL_BALL.style.width = EL_BALL_W + '%';
        EL_BALL.style.left = currentX + '%';

        if (captionX === -1 && b.state === _BALL_STATE_REMAIN) {
            captionX = currentX;
        }
        currentX += EL_BALL_W;
    });

    // Caption
    EL_REMAIN.style.left = captionX + '%';

    // Controls
    _getEl('controls__free')
        .classList
        .toggle('controls--hide', !STATE.allowFreeBall);
    Object
        .values(_BALL_TYPES)
        .forEach((type, i) => {
            const BALL_COUNT = _ballCount(type);

            if (type === _BALL_TYPES.red) {
                _getEl('controls__icon', i).innerHTML = BALL_COUNT;
                EL_FOULS[i].classList.toggle('controls--hide', BALL_COUNT === 0);
            }
            EL_FOULS[i + 1].classList.toggle('controls--hide', BALL_COUNT === 0);

            EL_POTS[i].classList.toggle(
                'controls--hide',
                !(type === _BALL_TYPES.red ? BALL_COUNT > 0 : STATE.afterRed) &&
                !(BALL_COUNT > 0 && type === _getLowestBallType())
            );
        });

    // Save state
    const PREV = { ...STATE };
    delete PREV.undos;
    STATE.undos.push(JSON.stringify(PREV));
}


//
// Private Helper functions
//

function _newBall(type = _BALL_TYPES.red, state = _BALL_STATE_REMAIN) {
    return {
        type,
        state
    };
}

function _getInsertIndex(player = STATE.activePlayer, remainEnd = false) {
    const FROM_END = player != remainEnd;
    return (
        STATE.balls[
            FROM_END
                ? 'findLastIndex'
                : 'findIndex'
        ](b => b.state === _BALL_STATE_REMAIN) +
        (FROM_END ? 1 : 0)
    );
}

function _getNextBall() {
    return STATE.balls[_getInsertIndex() - (STATE.activePlayer ? 1 : 0)];
}

function _addBall(ball, index) {
    STATE.balls.splice(index, 0, ball);
    const
        EL_BAR = _getEl('bar'),
        EL_BALL = document.createElement('span');
    EL_BALL.classList.add(
        'bar__ball',
        'bar__ball--add',
        'bar__ball--add-' + (index > STATE.balls.length * 0.5 ? '1' : '0')
    );
    EL_BAR.insertBefore(EL_BALL, EL_BAR.children[index]);
    STATE.lastAddedIndex = index;
    _afterAnimation(
        () => EL_BALL.classList.remove(
            'bar__ball--add',
            'bar__ball--add-0',
            'bar__ball--add-1'
        ),
        true
    );
}

function _removeBall(index) {
    if (index === undefined) {
        index = _getInsertIndex() - (STATE.activePlayer ? 1 : 0);
    } else if (index === -1) {
        index = STATE.lastAddedIndex;
    }
    STATE.balls.splice(index, 1);
    const EL_BALL = _getEl('bar__ball:not(.bar__ball--remove)', index);
    EL_BALL.classList.add(
        'bar__ball--remove',
        'bar__ball--remove-' + (index > STATE.balls.length * 0.5 ? 1 : 0)
    );
    _afterAnimation(() => {
        EL_BALL.parentElement.removeChild(EL_BALL)
    });
}

function _afterAnimation(callBack = () => {}, immediate = false) {
    return new Promise(resolve => {
        setTimeout(() => {
            callBack();
            resolve();
        }, immediate ? 0 : _ANI_DURATION);
    });
}

function _getLowestBallType() {
    return (
        STATE
            .balls
            .filter(b => b.state === _BALL_STATE_REMAIN && b.type > 0)
            .sort((a, b) => a.type - b.type)[0]
            ?.type ||
        Math.max(...Object.values(_BALL_TYPES))
    );
}

function _getFoulPenalty(type = 0) {
    return Math.max(
        type,
        _MIN_PENALTY,
        _getLowestBallType()
    );
}

function _ballCount(type, state = _BALL_STATE_REMAIN) {
    return STATE
        .balls
        .filter(b =>
            b.type === type &&
            b.state === state
        )
        .length;
}

function _getScore(player) {
    return STATE
        .balls
        .filter(b => b.state === player && (b.type > 0 || player !== _BALL_STATE_REMAIN))
        .reduce((sum, b) => sum + Math.abs(b.type), 0);
}

function _getScoreDiff() {
    return _getScore(0) - _getScore(1);
}

function _getEl(className, i = 0) {
    const ELS = Array.from(document.querySelectorAll(
        className
            .split(' ')
            .map(c => '.' + c)
            .join()
    ));
    return i === -1 ? ELS : ELS[i];
}


//
// Private functions
//

function _initState() {
    STATE = JSON.parse(JSON.stringify(_STATE_INIT));
}

function _init() {
    _initState();
    _initRender();
    _updateRender();
}

_init();