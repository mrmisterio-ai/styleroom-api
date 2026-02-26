import Replicate from 'replicate';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || '',
});

// YOLOv8 모델 - 객체 감지용
const YOLO_MODEL = 'ultralytics/yolov8:c8f69c7a4b6eb604f34eea95c57bbd2d93952f3aff468e5a90c4dea2f1b80074';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  area: number;
}

interface PersonDetection extends BoundingBox {
  centerX: number;
}

/**
 * 이미지를 Data URI로 변환
 */
async function toDataUri(filePath: string): Promise<string> {
  const data = await fs.readFile(path.resolve(filePath));
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${data.toString('base64')}`;
}

/**
 * YOLO를 사용하여 이미지에서 사람 감지
 */
async function detectPersons(imagePath: string): Promise<PersonDetection[]> {
  try {
    const imageUri = await toDataUri(imagePath);
    
    const output = await replicate.run(YOLO_MODEL, {
      input: {
        image: imageUri,
        conf: 0.25, // confidence threshold
        iou: 0.45,  // IoU threshold for NMS
      }
    }) as any;

    // YOLO 출력 파싱
    const detections: PersonDetection[] = [];
    
    if (!output || !output.detections) {
      console.warn('No detections returned from YOLO');
      return detections;
    }

    // person 클래스만 필터링 (COCO dataset에서 person은 class 0)
    for (const detection of output.detections) {
      if (detection.class_name === 'person' || detection.class === 0) {
        const box = detection.box || detection;
        const x = box.x1 || box.x || 0;
        const y = box.y1 || box.y || 0;
        const width = (box.x2 || box.x + box.width || 0) - x;
        const height = (box.y2 || box.y + box.height || 0) - y;
        
        detections.push({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          confidence: detection.confidence || 0,
          class: 'person',
          area: width * height,
          centerX: x + width / 2,
        });
      }
    }

    console.log(`Detected ${detections.length} person(s) in image`);
    return detections;
  } catch (error) {
    console.error('YOLO detection error:', error);
    // YOLO 실패 시 빈 배열 반환 (fallback)
    return [];
  }
}

/**
 * 프롬프트 분석하여 여러 명 중 특정 사람 선택
 */
function selectPerson(
  detections: PersonDetection[], 
  description?: string
): PersonDetection {
  if (!description) {
    // 기본: 가장 큰 바운딩박스 (가장 잘 보이는 사람)
    return detections.sort((a, b) => b.area - a.area)[0];
  }

  const desc = description.toLowerCase();
  
  // 위치 기반 선택
  if (desc.includes('왼쪽') || desc.includes('left')) {
    // x좌표가 가장 작은 (왼쪽에 있는) 사람
    return detections.sort((a, b) => a.centerX - b.centerX)[0];
  }
  
  if (desc.includes('오른쪽') || desc.includes('right')) {
    // x좌표가 가장 큰 (오른쪽에 있는) 사람
    return detections.sort((a, b) => b.centerX - a.centerX)[0];
  }
  
  if (desc.includes('가운데') || desc.includes('center') || desc.includes('middle')) {
    // 이미지 중앙에 가장 가까운 사람
    const metadata = detections[0]; // 이미지 크기 정보가 필요하면 sharp로 가져올 수 있음
    return detections.sort((a, b) => {
      const aDist = Math.abs(a.centerX - 500); // 대략적인 중앙값 (나중에 실제 이미지 너비 사용 가능)
      const bDist = Math.abs(b.centerX - 500);
      return aDist - bDist;
    })[0];
  }
  
  // 순서 기반 선택
  if (desc.includes('첫') || desc.includes('first') || desc.includes('1')) {
    return detections.sort((a, b) => a.centerX - b.centerX)[0];
  }
  
  if (desc.includes('두') || desc.includes('second') || desc.includes('2')) {
    const sorted = detections.sort((a, b) => a.centerX - b.centerX);
    return sorted[Math.min(1, sorted.length - 1)];
  }
  
  if (desc.includes('세') || desc.includes('third') || desc.includes('3')) {
    const sorted = detections.sort((a, b) => a.centerX - b.centerX);
    return sorted[Math.min(2, sorted.length - 1)];
  }
  
  // 기본: 가장 큰 사람
  return detections.sort((a, b) => b.area - a.area)[0];
}

/**
 * 바운딩박스를 사용하여 사람을 크롭하고, 여백 추가
 */
async function cropPerson(
  imagePath: string, 
  detection: PersonDetection
): Promise<string> {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Failed to get image dimensions');
    }

    // 크롭 영역에 여백 추가 (10%)
    const padding = 0.1;
    const paddedWidth = detection.width * (1 + padding * 2);
    const paddedHeight = detection.height * (1 + padding * 2);
    
    let left = Math.max(0, detection.x - detection.width * padding);
    let top = Math.max(0, detection.y - detection.height * padding);
    let width = Math.min(paddedWidth, metadata.width - left);
    let height = Math.min(paddedHeight, metadata.height - top);
    
    // 정수로 변환
    left = Math.round(left);
    top = Math.round(top);
    width = Math.round(width);
    height = Math.round(height);

    // 크롭된 이미지 저장
    const outputDir = path.join('uploads', 'cropped');
    await fs.mkdir(outputDir, { recursive: true });
    
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const outputPath = path.join(outputDir, `${timestamp}-${randomSuffix}.png`);
    
    await image
      .extract({ left, top, width, height })
      .toFile(outputPath);
    
    console.log(`Cropped person to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Crop error:', error);
    throw new Error('Failed to crop person from image');
  }
}

/**
 * 전처리 파이프라인 메인 함수
 * 이미지에서 사람을 감지하고 크롭하여 VTON에 적합한 이미지 반환
 */
export async function preprocessModelImage(
  imagePath: string,
  personDescription?: string
): Promise<string> {
  try {
    console.log(`Preprocessing model image: ${imagePath}`);
    
    // 1. YOLO로 사람 감지
    const detections = await detectPersons(imagePath);
    
    // 2. 사람이 없는 경우
    if (detections.length === 0) {
      throw new Error('사진에서 사람을 찾을 수 없습니다. 한 명 이상의 사람이 잘 보이는 사진을 사용해주세요.');
    }
    
    // 3. 사람이 1명인 경우 - 바로 크롭
    if (detections.length === 1) {
      console.log('Single person detected, cropping...');
      return await cropPerson(imagePath, detections[0]);
    }
    
    // 4. 여러 명인 경우 - 프롬프트로 특정
    console.log(`Multiple persons detected (${detections.length}), selecting target...`);
    const target = selectPerson(detections, personDescription);
    
    if (personDescription) {
      console.log(`Selected person based on description: "${personDescription}"`);
    } else {
      console.log('No description provided, selected largest person');
    }
    
    return await cropPerson(imagePath, target);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('전처리 중 오류가 발생했습니다.');
  }
}
