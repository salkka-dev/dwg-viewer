// Korean wording for the engine's prompts on the commands this app exposes.
// Merged over the English messages (the engine has no Korean locale), so any
// prompt not listed here simply stays in English. Keyword `local`/`global`
// names are left alone so typed shortcuts keep working; only `display` changes.

const kw = (display: string) => ({ display })

export const KO_PROMPTS = {
  main: {
    commandLine: {
      canceled: '*취소됨*',
      invalidInput: '입력이 올바르지 않아요.',
      noLast: '(이전 명령 없음)',
      unknownCommand: '없는 명령이에요',
      executed: '실행한 명령',
      showHistory: '명령 기록 보기',
      placeholder: '명령 입력 (예: L, C, M, CO, E)',
      showMessages: '메시지 기록 보기',
      noHistory: '(기록 없음)',
      close: '명령줄 닫기'
    },
    mobileCommand: {
      length: '길이',
      angle: '각도',
      confirm: '확인',
      cancel: '취소',
      help: '도움말',
      back: '뒤로',
      collapse: '접기',
      expand: '펼치기'
    },
    inputManager: {
      firstCorner: '첫 모서리를 찍거나 옵션을 고르세요',
      secondCorner: '반대쪽 모서리를 찍거나 옵션을 고르세요'
    },
    touchPointTutorial: {
      title: '점을 정확하게 찍는 법',
      description:
        '화면을 0.5초쯤 길게 누르세요. 손가락 위에 십자선이 생겨 손을 따라 움직이고, 가까운 선과 점에 달라붙어요. 손을 떼면 그 자리가 찍혀요.',
      snoozeToday: '오늘은 그만 보기',
      hideForever: '다시 보지 않기',
      ok: '알겠어요'
    },
    textHeight: {
      title: '글자 높이',
      close: '닫기',
      ok: '확인',
      cancel: '취소',
      adaptive: '화면에 맞추기',
      custom: '높이 직접 입력',
      customPlaceholder: '도면 단위 높이',
      fromScreen: '화면 크기로 정하기',
      fromScreenHint:
        '지금 확대한 상태에서 글자가 화면에 보일 크기를 입력하세요. 도면 단위 높이로 바뀌어서 나중에 확대하거나 축소해도 그대로예요.',
      screenPxPlaceholder: '글자 크기',
      convert: '바꾸기'
    },
    drawStyle: { color: '색', fontSize: '글자 높이' },
    entityPick: { cancel: '선택 취소' },
    colorPicker: { title: '색 고르기', close: '닫기', ok: '확인', cancel: '취소', index: '색 번호: ', input: '색' },
    message: { onLockedLayer: '잠긴 레이어에 있어요.' }
  },
  command: {
    ACAD: {
      erase: { prompt: '지울 객체를 고르고 확인을 누르세요' },
      move: { prompt: '옮길 객체를 고르고 확인을 누르세요' },
      copy: { prompt: '복사할 객체를 고르고 확인을 누르세요' },
      rotate: { prompt: '회전할 객체를 고르고 확인을 누르세요' },
      laycur: { prompt: '현재 레이어로 옮길 객체를 고르고 확인을 누르세요' },
      layfrz: { prompt: '동결할 레이어의 객체를 고르세요' },
      layiso: { prompt: '남겨 둘 레이어의 객체를 고르고 확인을 누르세요' },
      laylck: { prompt: '잠글 레이어의 객체를 고르세요' },
      layoff: { prompt: '끌 레이어의 객체를 고르세요' },
      layulk: { prompt: '잠금을 풀 레이어의 객체를 고르세요' }
    }
  },
  jig: {
    line: {
      firstPoint: '첫 점을 찍으세요',
      firstPointOrContinue: '첫 점을 찍거나 옵션을 고르세요',
      nextPoint: '다음 점을 찍으세요',
      nextPointWithOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      keywords: { continue: kw('이어 그리기(C)'), undo: kw('한 단계 취소(U)'), close: kw('닫기(C)') }
    },
    polyline: {
      firstPoint: '첫 점을 찍으세요',
      nextPoint: '다음 점을 찍으세요. 끝내려면 확인',
      nextPointWithOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      nextPointWithArcOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      arcAngle: '호의 각도를 입력하세요',
      arcCenter: '호의 중심을 찍으세요',
      arcSecondPoint: '호 위의 두 번째 점을 찍으세요',
      arcEndPoint: '호의 끝점을 찍으세요',
      arcRadius: '호의 반지름을 입력하세요',
      keywords: {
        arc: kw('호(A)'),
        undo: kw('한 단계 취소(U)'),
        close: kw('닫기(C)'),
        line: kw('직선(L)'),
        angle: kw('각도(A)'),
        center: kw('중심(C)'),
        secondPoint: kw('두 번째 점(P)'),
        radius: kw('반지름(R)')
      }
    },
    rect: {
      firstPoint: '첫 모서리를 찍으세요',
      nextPoint: '반대쪽 모서리를 찍으세요',
      firstPointWithOptions: '첫 모서리를 찍거나 옵션을 고르세요',
      otherCornerWithOptions: '반대쪽 모서리를 찍거나 옵션을 고르세요',
      chamferFirst: '첫 번째 모따기 거리를 입력하세요',
      chamferSecond: '두 번째 모따기 거리를 입력하세요',
      filletRadius: '모깎기 반지름을 입력하세요',
      segmentWidth: '선 두께를 입력하세요',
      elevationValue: '고도를 입력하세요',
      thicknessValue: '두께를 입력하세요',
      rotationAngle: '사각형 회전 각도를 입력하세요',
      dimensionLength: '가로 길이를 입력하세요',
      dimensionWidth: '세로 길이를 입력하세요',
      areaValue: '면적을 입력하세요',
      areaLengthOrWidth: '가로 길이를 입력하세요',
      areaSpecifyWidth: '세로 길이를 입력하세요',
      invalidPositive: '0보다 큰 값을 입력하세요.',
      invalidRect: '사각형을 만들 수 없어요. 모서리나 크기를 다시 정하세요.',
      thicknessNotSupported: '두께 값은 아직 저장되지 않아서 무시돼요.',
      keywords: {
        chamfer: kw('모따기(C)'),
        elevation: kw('고도(E)'),
        fillet: kw('모깎기(F)'),
        thickness: kw('두께(T)'),
        width: kw('선 두께(W)'),
        area: kw('면적(A)'),
        dimensions: kw('크기(D)'),
        rotation: kw('회전(R)'),
        length: kw('가로(L)'),
        rectWidth: kw('세로(W)')
      }
    },
    circle: {
      center: '원의 중심을 찍으세요',
      centerOrOptions: '원의 중심을 찍거나 옵션을 고르세요',
      radius: '반지름을 정하세요',
      radiusOrDiameter: '반지름을 정하거나 옵션을 고르세요',
      diameter: '지름을 정하세요',
      twoPointFirst: '지름의 첫 끝점을 찍으세요',
      twoPointSecond: '지름의 다른 끝점을 찍으세요',
      threePointFirst: '원 위의 첫 점을 찍으세요',
      threePointSecond: '원 위의 두 번째 점을 찍으세요',
      threePointThird: '원 위의 세 번째 점을 찍으세요',
      keywords: { threeP: kw('세 점(3P)'), twoP: kw('두 점(2P)'), diameter: kw('지름(D)') }
    },
    arc: {
      startPointOrCenter: '호의 시작점을 찍거나 옵션을 고르세요',
      secondPointOrOptions: '호의 두 번째 점을 찍거나 옵션을 고르세요',
      secondPoint: '호의 두 번째 점을 찍으세요',
      startPoint: '호의 시작점을 찍으세요',
      centerPoint: '호의 중심을 찍으세요',
      endPoint: '호의 끝점을 찍으세요',
      endPointOrOptions: '호의 끝점을 찍거나 옵션을 고르세요',
      centerPointOrOptions: '호의 중심을 찍으세요',
      includedAngle: '사잇각을 입력하세요',
      chordLength: '현의 길이를 입력하세요',
      tangentDirection: '시작점의 접선 방향을 정하세요',
      radius: '호의 반지름을 입력하세요',
      keywords: {
        center: kw('중심(C)'),
        end: kw('끝점(E)'),
        angle: kw('각도(A)'),
        chordLength: kw('현 길이(L)'),
        direction: kw('방향(D)'),
        radius: kw('반지름(R)')
      },
      invalid: {
        threePoint: '세 점이 한 줄에 있어서 호를 만들 수 없어요.',
        center: '시작점과 끝점이 같은 원 위에 있어야 해요.',
        angle: '사잇각은 0도보다 크고 360도보다 작아야 해요.',
        chordLength: '지금 반지름으로는 만들 수 없는 현 길이예요.',
        direction: '이 접선 방향으로는 호를 만들 수 없어요.',
        radius: '이 반지름으로는 시작점과 끝점을 이을 수 없어요.'
      }
    },
    mtext: { point: '글자를 넣을 자리를 찍으세요' },
    dimlinear: {
      xLine1Point: '첫 번째 치수 기준점을 찍으세요. 객체를 고르려면 확인',
      xLine2Point: '두 번째 치수 기준점을 찍으세요',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      selectObject: '치수를 잴 객체를 고르세요',
      rejectObject: '이 객체에는 치수를 넣을 수 없어요.',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      rotationAngle: '치수선 각도를 정하세요',
      keywords: {
        mtext: kw('여러 줄 글자(M)'),
        text: kw('글자(T)'),
        angle: kw('각도(A)'),
        horizontal: kw('가로(H)'),
        vertical: kw('세로(V)'),
        rotated: kw('회전(R)')
      }
    },
    dimaligned: {
      xLine1Point: '첫 번째 치수 기준점을 찍으세요. 객체를 고르려면 확인',
      xLine2Point: '두 번째 치수 기준점을 찍으세요',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      selectObject: '치수를 잴 객체를 고르세요',
      rejectObject: '이 객체에는 사선 치수를 넣을 수 없어요.',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    revcloud: {
      firstCornerOrOptions: '첫 모서리를 찍거나 옵션을 고르세요',
      firstCorner: '첫 모서리를 찍으세요',
      oppositeCorner: '반대쪽 모서리를 찍으세요',
      startPoint: '시작점을 찍으세요',
      nextPoint: '다음 점을 찍으세요',
      nextPointOrUndo: '다음 점을 찍거나 옵션을 고르세요',
      firstPoint: '첫 점을 찍으세요',
      guideCursor: '구름 모양을 따라 그리세요. 끝내려면 확인',
      arcLength: '구름 호 길이를 입력하세요',
      selectObject: '구름으로 바꿀 객체를 고르세요',
      style: '구름 호 모양을 고르세요',
      reverseDirection: '방향을 뒤집을까요?',
      invalidArcLength: '호 길이는 0보다 커야 해요.',
      invalidObject: '고른 객체는 구름으로 바꿀 수 없어요.',
      keywords: {
        arcLength: kw('호 길이(A)'),
        object: kw('객체(O)'),
        rectangular: kw('사각형(R)'),
        polygonal: kw('다각형(P)'),
        freehand: kw('자유곡선(F)'),
        style: kw('모양(S)'),
        normal: kw('보통(N)'),
        calligraphy: kw('붓글씨(C)'),
        undo: kw('한 단계 취소(U)'),
        yes: kw('예(Y)'),
        no: kw('아니요(N)')
      }
    },
    move: {
      basePointOrDisplacement: '기준점을 찍거나 옵션을 고르세요',
      secondPointOrDisplacement: '옮길 자리를 찍거나 옵션을 고르세요',
      displacement: '이동 거리를 입력하세요',
      keywords: { displacement: kw('거리 입력(D)') }
    },
    copy: {
      basePointOrOptions: '기준점을 찍거나 옵션을 고르세요',
      displacementOrArray: '이동 거리를 정하거나 옵션을 고르세요',
      secondPointOrArray: '복사할 자리를 찍거나 옵션을 고르세요. 끝내려면 확인',
      modePrompt: '복사 방식을 고르세요',
      arrayItemCount: '원본을 포함한 배열 개수를 입력하세요',
      arraySecondPointOrFit: '두 번째 점을 찍거나 옵션을 고르세요',
      arrayFitSecondPoint: '두 번째 점을 찍으세요',
      keywords: {
        displacement: kw('거리 입력(D)'),
        mode: kw('방식(O)'),
        multiple: kw('여러 번(M)'),
        single: kw('한 번(S)'),
        array: kw('배열(A)'),
        fit: kw('맞춤(F)')
      }
    },
    rotate: {
      basePoint: '회전 중심을 찍으세요',
      rotationAngleOrOptions: '회전 각도를 정하거나 옵션을 고르세요',
      referenceAngleOrPoints: '기준 각도를 정하거나 옵션을 고르세요',
      firstReferencePoint: '기준 각도의 첫 점을 찍으세요',
      secondReferencePoint: '두 번째 점을 찍으세요',
      newAngle: '새 각도를 정하세요',
      keywords: { copy: kw('복사(C)'), reference: kw('기준(R)'), points: kw('점(P)') },
      invalid: { referencePoints: '기준점 두 개가 서로 달라야 해요.' }
    },
    ellipse: {
      axisEndpointOrOptions: '타원 축의 끝점을 찍거나 옵션을 고르세요',
      arcAxisEndpointOrCenter: '타원호 축의 끝점을 찍거나 옵션을 고르세요',
      center: '타원의 중심을 찍으세요',
      firstAxisEndpoint: '축의 끝점을 찍으세요',
      secondAxisEndpoint: '축의 다른 끝점을 찍으세요',
      otherAxisOrRotation: '다른 축까지의 거리를 정하거나 옵션을 고르세요',
      rotationAngle: '장축을 기준으로 한 회전 각도를 정하세요',
      arcStartAngle: '타원호의 시작 각도를 정하세요',
      arcEndAngle: '타원호의 끝 각도를 정하세요',
      keywords: { arc: kw('호(A)'), center: kw('중심(C)'), rotation: kw('회전(R)') },
      invalid: {
        axis: '축 길이는 0보다 커야 해요.',
        otherAxis: '다른 축까지의 거리는 0보다 커야 해요.',
        rotation: '이 회전 각도로는 단축이 0이 돼요.'
      }
    },
    spline: {
      firstPoint: '첫 점을 찍으세요',
      nextPoint: '다음 점을 찍으세요. 끝내려면 확인',
      firstPointWithOptions: '첫 점을 찍거나 옵션을 고르세요',
      nextPointWithFitOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      nextPointWithCvOptions: '다음 조정점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      methodPrompt: '스플라인 그리는 방식을 고르세요',
      knotsPrompt: '매듭 방식을 고르세요',
      degreePrompt: '스플라인 차수를 입력하세요',
      keywords: {
        method: kw('방식(M)'),
        fit: kw('맞춤점(F)'),
        cv: kw('조정점(C)'),
        knots: kw('매듭(K)'),
        degree: kw('차수(D)'),
        undo: kw('한 단계 취소(U)'),
        close: kw('닫기(C)'),
        chord: kw('현(C)'),
        sqrtChord: kw('현 제곱근(S)'),
        uniform: kw('균일(U)')
      }
    },
    polygon: {
      numberOfSides: '변의 개수를 입력하세요',
      centerOrEdge: '다각형의 중심을 찍거나 옵션을 고르세요',
      radiusOrType: '원에 내접할지 외접할지 고르세요',
      edgeStart: '한 변의 첫 끝점을 찍으세요',
      edgeEnd: '한 변의 다른 끝점을 찍으세요',
      keywords: { edge: kw('변으로(E)'), inscribed: kw('원에 내접(I)'), circumscribed: kw('원에 외접(C)') },
      invalid: {
        sides: '변의 개수는 3에서 1024 사이의 정수로 입력하세요.',
        radius: '반지름은 0보다 커야 해요.',
        edge: '변의 길이는 0보다 커야 해요.'
      }
    },
    point: { point: '점을 찍으세요' },
    xline: {
      firstPointOrOptions: '점을 찍거나 옵션을 고르세요',
      secondPoint: '두 번째 점을 찍으세요',
      throughPoint: '지나갈 점을 찍으세요',
      angle: '무한선의 각도를 입력하세요',
      invalidDirection: '무한선 방향이 올바르지 않아요.',
      keywords: { hor: kw('수평(H)'), ver: kw('수직(V)'), ang: kw('각도(A)') }
    },
    ray: { startPoint: '시작점을 찍으세요', throughPoint: '지나갈 점을 찍으세요' },
    dimradius: {
      selectObject: '호나 원을 고르세요',
      rejectObject: '호나 원을 골라야 해요.',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    dimdiameter: {
      selectObject: '호나 원을 고르세요',
      rejectObject: '호나 원을 골라야 해요.',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    dimangular: {
      vertexOrSelect: '각의 꼭짓점을 찍으세요. 선을 고르려면 확인',
      xLine1Point: '각의 첫 번째 끝점을 찍으세요',
      xLine2Point: '각의 두 번째 끝점을 찍으세요',
      arcPoint: '치수 호를 놓을 자리를 찍으세요',
      selectFirstLine: '첫 번째 선을 고르세요',
      selectSecondLine: '두 번째 선을 고르세요',
      rejectObject: '선을 골라야 해요.',
      linesParallel: '두 선이 평행이라 각을 잴 수 없어요.',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    dimarc: {
      selectArc: '호를 고르세요',
      rejectObject: '호를 골라야 해요.',
      arcPoint: '호 길이 치수를 놓을 자리를 찍으세요',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    dimordinate: {
      featurePoint: '좌표를 표시할 자리를 찍으세요',
      leaderEndpoint: '지시선 끝점을 찍으세요',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: {
        mtext: kw('여러 줄 글자(M)'),
        text: kw('글자(T)'),
        angle: kw('각도(A)'),
        xdatum: kw('X 좌표(X)'),
        ydatum: kw('Y 좌표(Y)')
      }
    },
    dimcontinue: {
      nextPoint: '다음 치수 기준점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      selectDimension: '이어 갈 치수를 고르세요',
      rejectObject: '선형이나 각도 치수를 골라야 해요.',
      keywords: { select: kw('치수 고르기(S)') }
    },
    dimbaseline: {
      nextPoint: '다음 치수 기준점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      selectDimension: '기준이 될 치수를 고르세요',
      rejectObject: '선형이나 각도 치수를 골라야 해요.',
      keywords: { select: kw('치수 고르기(S)') }
    },
    hatch: {
      prompt: '경계가 될 객체를 고르거나 옵션을 고르세요',
      pickPoint: '칠할 영역 안쪽을 찍으세요. 끝내려면 확인',
      select: '해치를 넣을 객체를 고르세요',
      patternName: '해치 무늬 이름을 입력하세요',
      scale: '해치 무늬 축척을 입력하세요',
      angle: '해치 무늬 각도를 입력하세요',
      style: '해치 방식을 고르세요',
      associative: '경계와 연동할지 고르세요',
      invalidBoundary: '고른 객체로는 닫힌 경계가 만들어지지 않아요.',
      keywords: {
        pick: kw('안쪽 찍기(P)'),
        select: kw('객체 고르기(S)'),
        cancel: kw('취소(C)'),
        pattern: kw('무늬(P)'),
        scale: kw('축척(S)'),
        angle: kw('각도(A)'),
        style: kw('방식(T)'),
        associative: kw('연동(AS)'),
        normal: kw('보통(N)'),
        outer: kw('바깥쪽만(O)'),
        ignore: kw('무시(I)'),
        yes: kw('예(Y)'),
        no: kw('아니요(N)')
      }
    },
    insert: {
      blockName: '블록 이름을 입력하세요',
      insertionPoint: '블록을 놓을 자리를 찍으세요',
      scale: '축척을 입력하세요',
      rotation: '회전 각도를 입력하세요',
      invalidScale: '축척은 0보다 커야 해요.',
      invalidBlockName: '블록 이름이 올바르지 않아요.',
      blockNotFound: '그 블록이 없어요',
      xrefNotAllowed: '외부 참조는 이 방법으로 넣을 수 없어요.'
    },
    measureDistance: { firstPoint: '첫 점을 찍으세요', secondPoint: '두 번째 점을 찍으세요' },
    measureContinuous: { firstPoint: '첫 점을 찍으세요', nextPoint: '다음 점을 찍으세요. 끝내려면 확인' },
    measureArea: { firstPoint: '첫 점을 찍으세요', nextPoint: '다음 점을 찍으세요. 끝내려면 확인' },
    measureAngle: {
      vertex: '각의 꼭짓점을 찍으세요',
      arm1: '첫 번째 변 위의 점을 찍으세요',
      arm2: '두 번째 변 위의 점을 찍으세요'
    },
    measureArc: {
      startPoint: '호의 시작점을 찍으세요',
      throughPoint: '호 위의 점을 찍으세요',
      endPoint: '호의 끝점을 찍으세요',
      lockedEndPoint: '호의 끝점을 찍으세요 (Ctrl로 큰 호와 작은 호 바꾸기)',
      invalidPoints: '세 점이 한 줄에 있어서 호가 되지 않아요.'
    },
    measurePoint: { point: '좌표를 볼 점을 찍으세요' },
    laycur: {
      prompt: '현재 레이어로 옮길 객체를 고르고 확인을 누르세요',
      currentLayerNotFound: '현재 레이어를 찾지 못했어요.',
      noObjects: '고른 객체가 없어요.',
      alreadyCurrent: '고른 객체가 이미 현재 레이어에 있어요.',
      changed: '현재 레이어로 옮긴 객체'
    },
    layon: { alreadyOn: '모든 레이어가 이미 켜져 있어요.', turnedOn: '켠 레이어' },
    laythw: { alreadyThawed: '동결된 레이어가 없어요.', thawed: '동결을 푼 레이어' },
    layerp: { restored: '직전 레이어 상태로 되돌렸어요.', noPreviousState: '되돌릴 레이어 상태가 없어요.' },
    layoff: {
      prompt: '끌 레이어의 객체를 고르거나 옵션을 고르세요',
      invalidSelection: '고를 수 없는 객체예요.',
      layerNotFound: '레이어를 찾지 못했어요',
      cannotTurnOffCurrent: '현재 레이어는 끌 수 없어요.',
      alreadyOff: '이미 꺼진 레이어예요',
      turnedOff: '끈 레이어',
      restored: '되살린 레이어',
      nothingToUndo: '되돌릴 레이어 끄기가 없어요.',
      keywords: {
        settings: kw('설정(S)'),
        undo: kw('한 단계 취소(U)'),
        viewports: kw('뷰포트(V)'),
        blockSelection: kw('블록 고르기(B)'),
        off: kw('끄기(O)'),
        vpfreeze: kw('뷰포트 동결(V)'),
        block: kw('블록(B)'),
        entity: kw('객체(E)'),
        none: kw('없음(N)')
      }
    },
    layfrz: {
      prompt: '동결할 레이어의 객체를 고르거나 옵션을 고르세요',
      invalidSelection: '고를 수 없는 객체예요.',
      layerNotFound: '레이어를 찾지 못했어요',
      cannotFreezeCurrent: '현재 레이어는 동결할 수 없어요.',
      alreadyFrozen: '이미 동결된 레이어예요',
      frozen: '동결한 레이어',
      restored: '되살린 레이어',
      nothingToUndo: '되돌릴 레이어 동결이 없어요.',
      keywords: {
        settings: kw('설정(S)'),
        undo: kw('한 단계 취소(U)'),
        viewports: kw('뷰포트(V)'),
        blockSelection: kw('블록 고르기(B)'),
        freeze: kw('동결(F)'),
        vpfreeze: kw('뷰포트 동결(V)'),
        block: kw('블록(B)'),
        entity: kw('객체(E)'),
        none: kw('없음(N)')
      }
    },
    layiso: {
      prompt: '남겨 둘 레이어의 객체를 고르거나 옵션을 고르세요. 끝내려면 확인',
      noLayers: '고른 레이어가 없어요.',
      layerNotFound: '레이어를 찾지 못했어요',
      isolated: '남겨 둔 레이어',
      affectedLayers: '바뀐 레이어',
      keywords: { settings: kw('설정(S)'), off: kw('끄기(O)'), lockAndFade: kw('잠그고 흐리게(L)'), vpfreeze: kw('뷰포트 동결(V)') }
    },
    layuniso: {
      noPrevious: '되돌릴 레이어 고립이 없어요.',
      layerNotFound: '레이어를 찾지 못했어요',
      nothingRestored: '되돌린 레이어가 없어요.',
      restored: '다시 보이게 한 레이어'
    },
    laylck: {
      prompt: '잠글 레이어의 객체를 고르세요',
      invalidSelection: '고를 수 없는 객체예요.',
      layerNotFound: '레이어를 찾지 못했어요',
      alreadyLocked: '이미 잠긴 레이어예요',
      locked: '잠근 레이어'
    },
    layulk: {
      prompt: '잠금을 풀 레이어의 객체를 고르세요',
      invalidSelection: '고를 수 없는 객체예요.',
      layerNotFound: '레이어를 찾지 못했어요',
      alreadyUnlocked: '이미 잠금이 풀린 레이어예요',
      unlocked: '잠금을 푼 레이어'
    },
    offset: {
      distance: '띄울 간격을 입력하세요',
      selectObject: '간격을 띄울 객체를 고르세요. 끝내려면 확인',
      sidePoint: '띄울 쪽을 찍으세요',
      invalidDistance: '간격은 0보다 커야 해요.',
      invalidSelection: '고른 객체는 간격을 띄울 수 없어요.',
      offsetFailed: '그쪽으로는 간격 띄운 선을 만들 수 없어요.'
    }
  }
}
